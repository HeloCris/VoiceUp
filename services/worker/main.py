"""VoiceUp speech processing worker.

Accepts Cloud Tasks payloads, downloads audio, performs transcription, derives
feedback metrics, and stores results back to Firestore.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Tuple

from google.cloud import firestore, speech, storage
from vertexai import init as vertex_init
from vertexai.generative_models import GenerativeModel, GenerationConfig
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)


def load_worker_env() -> None:
    env_path = os.path.join(os.path.dirname(__file__), 'worker_env.txt')
    if not os.path.isfile(env_path):
        LOGGER.info('No worker_env.txt found at %s', env_path)
        return

    LOGGER.info('Loading worker env from %s', env_path)
    with open(env_path, 'r', encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                continue
            name, value = line.split('=', 1)
            name = name.strip()
            value = value.strip()
            if name:
                os.environ[name] = value
                LOGGER.info('Loaded env %s', name)


load_worker_env()

@dataclass
class TaskPayload:
    attempt_id: str
    mission_id: str
    storage_uri: str = ""
    language_code: str = "en-US"
    audio_content: str | None = None
    audio_encoding: str = "WEBM_OPUS"
    sample_rate_hertz: int = 48000
    return_feedback: bool = False

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TaskPayload":
        return cls(
            attempt_id=data["attemptId"],
            storage_uri=data.get("storageUri", ""),
            mission_id=data.get("missionId", ""),
            language_code=data.get("languageCode", "en-US"),
            audio_content=data.get("audioContent"),
            audio_encoding=data.get("audioEncoding", "WEBM_OPUS"),
            sample_rate_hertz=data.get("sampleRateHertz", 48000),
            return_feedback=data.get("returnFeedback", False),
        )


class SpeechProcessor:
    def __init__(self) -> None:
        self._speech_client = speech.SpeechClient()
        self._firestore = firestore.Client()
        self._storage = storage.Client()
        self._vertex_model = self._load_vertex_model()

    def _load_vertex_model(self) -> GenerativeModel | None:
        project = os.getenv("VERTEX_PROJECT") or os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("VERTEX_LOCATION", "us-central1")
        model_name = os.getenv("VERTEX_MODEL", "gemini-1.5-flash")
        if not project:
            return None
        try:
            vertex_init(project=project, location=location)
            return GenerativeModel(model_name)
        except Exception:  # pylint: disable=broad-except
            LOGGER.exception("Failed to init Vertex model")
            return None

    def process(self, payload: TaskPayload) -> Dict[str, Any] | None:
        LOGGER.info(
            "Processing attempt %s audio=%s encoding=%s sample_rate=%s return_feedback=%s",
            payload.attempt_id,
            "present" if payload.audio_content or payload.storage_uri else "missing",
            payload.audio_encoding,
            payload.sample_rate_hertz,
            payload.return_feedback,
        )
        audio = self._build_audio(payload)
        config_kwargs: Dict[str, Any] = {
            "language_code": payload.language_code,
            "enable_automatic_punctuation": True,
            "enable_word_time_offsets": True,
            "enable_word_confidence": True,
            "use_enhanced": True,
            "model": "latest_short",
            "audio_channel_count": 1,
        }
        if payload.audio_content:
            config_kwargs["encoding"] = self._resolve_encoding(payload.audio_encoding)
            if payload.audio_encoding.upper() not in {"WEBM_OPUS", "OGG_OPUS"}:
                config_kwargs["sample_rate_hertz"] = payload.sample_rate_hertz
        config = speech.RecognitionConfig(**config_kwargs)

        response = self._speech_client.recognize(config=config, audio=audio)
        transcript_text, word_timings = self._build_transcript(response)
        LOGGER.info('Initial transcript length=%d words=%d', len(transcript_text), len(word_timings))
        fallback_response = None
        if not transcript_text:
            fallback_config_kwargs = {
                "language_code": payload.language_code,
                "enable_automatic_punctuation": True,
                "enable_word_time_offsets": True,
                "enable_word_confidence": True,
                "use_enhanced": True,
                "model": "latest_long",
                "audio_channel_count": 1,
            }
            if payload.audio_content:
                fallback_config_kwargs["encoding"] = self._resolve_encoding(payload.audio_encoding)
                if payload.audio_encoding.upper() not in {"WEBM_OPUS", "OGG_OPUS"}:
                    fallback_config_kwargs["sample_rate_hertz"] = payload.sample_rate_hertz
            fallback_config = speech.RecognitionConfig(**fallback_config_kwargs)
            operation = self._speech_client.long_running_recognize(config=fallback_config, audio=audio)
            fallback_response = operation.result(timeout=600)
            fallback_text, fallback_word_timings = self._build_transcript(fallback_response)
            LOGGER.info('Fallback transcript length=%d words=%d', len(fallback_text), len(fallback_word_timings))
            if fallback_text:
                transcript_text = fallback_text
                word_timings = fallback_word_timings

        avg_confidence = self._average_confidence(response)
        if fallback_response is not None and transcript_text:
            avg_confidence = self._average_confidence(fallback_response)
        elif not transcript_text:
            avg_confidence = self._average_confidence(response)
        metrics = self._build_metrics(word_timings)
        pronunciation = self._analyze_pronunciation(word_timings)
        feedback = self._build_feedback(transcript_text, avg_confidence, metrics, pronunciation)
        ai_feedback = self._generate_vertex_feedback(
            transcript_text, avg_confidence, metrics, pronunciation
        )
        export_uri = self._export_transcript(payload, transcript_text)
        self._persist_results(payload, transcript_text, feedback, ai_feedback, word_timings, export_uri)

        return {
            "transcript": transcript_text,
            "feedback": feedback,
            "aiFeedback": ai_feedback,
            "wordTimings": word_timings,
        }

    def _build_audio(self, payload: TaskPayload) -> speech.RecognitionAudio:
        if payload.audio_content:
            decoded = base64.b64decode(payload.audio_content)
            return speech.RecognitionAudio(content=decoded)
        return speech.RecognitionAudio(uri=payload.storage_uri)

    def _resolve_encoding(self, encoding: str) -> speech.RecognitionConfig.AudioEncoding:
        if encoding.upper() == "WEBM_OPUS":
            return speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
        if encoding.upper() == "OGG_OPUS":
            return speech.RecognitionConfig.AudioEncoding.OGG_OPUS
        if encoding.upper() == "LINEAR16":
            return speech.RecognitionConfig.AudioEncoding.LINEAR16
        return speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED

    def _build_transcript(
        self, response: speech.LongRunningRecognizeResponse
    ) -> Tuple[str, List[Dict[str, Any]]]:
        transcript_parts: List[str] = []
        word_timings: List[Dict[str, Any]] = []
        for result in response.results:
            if not result.alternatives:
                continue
            alternative = result.alternatives[0]
            transcript_parts.append(alternative.transcript)
            for word_info in alternative.words:
                start = word_info.start_time.total_seconds()
                end = word_info.end_time.total_seconds()
                confidence = getattr(word_info, "confidence", 0.0)
                word_timings.append(
                    {
                        "word": word_info.word,
                        "start": start,
                        "end": end,
                        "confidence": confidence,
                        "lowConfidence": confidence > 0 and confidence < 0.6,
                    }
                )
        return " ".join(transcript_parts).strip(), word_timings

    def _average_confidence(self, response: speech.LongRunningRecognizeResponse) -> float:
        confidences = [
            result.alternatives[0].confidence
            for result in response.results
            if result.alternatives
        ]
        if not confidences:
            return 0.0
        return sum(confidences) / len(confidences)

    def _build_metrics(self, word_timings: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not word_timings:
            return {
                "wordCount": 0,
                "uniqueWordCount": 0,
                "lexicalDiversity": 0.0,
                "speechDurationSeconds": 0.0,
                "wordsPerMinute": 0.0,
                "pauseCount": 0,
                "longPauses": [],
            }

        words = [entry["word"] for entry in word_timings]
        normalized = [word.lower() for word in words]
        word_count = len(words)
        unique_word_count = len(set(normalized))
        duration_seconds = max(word_timings[-1]["end"] - word_timings[0]["start"], 0.0)
        minutes = duration_seconds / 60 if duration_seconds > 0 else 0.0
        wpm = word_count / minutes if minutes > 0 else 0.0
        long_pauses = []
        pause_count = 0
        for previous, current in zip(word_timings, word_timings[1:]):
            gap = current["start"] - previous["end"]
            if gap > 2.0:
                pause_count += 1
                long_pauses.append({"after": previous["word"], "gapSeconds": round(gap, 2)})

        return {
            "wordCount": word_count,
            "uniqueWordCount": unique_word_count,
            "lexicalDiversity": round(unique_word_count / word_count, 3),
            "speechDurationSeconds": round(duration_seconds, 2),
            "wordsPerMinute": round(wpm, 1),
            "pauseCount": pause_count,
            "longPauses": long_pauses,
        }

    def _analyze_pronunciation(self, word_timings: List[Dict[str, Any]]) -> Dict[str, Any]:
        low_confidence_words = [
            entry for entry in word_timings if entry.get("lowConfidence")
        ]
        focus_sounds = set()
        for entry in low_confidence_words:
            if "th" in entry["word"].lower():
                focus_sounds.add("/th/")

        return {
            "lowConfidenceWords": [entry["word"] for entry in low_confidence_words],
            "errorRate": round(len(low_confidence_words) / max(len(word_timings), 1), 3),
            "focusSounds": sorted(focus_sounds),
        }

    def _build_feedback(
        self,
        transcript: str,
        confidence: float,
        metrics: Dict[str, Any],
        pronunciation: Dict[str, Any],
    ) -> Dict[str, Any]:
        tokens = transcript.split()
        return {
            "transcript": transcript,
            "confidence": confidence,
            "wordCount": len(tokens),
            "metrics": metrics,
            "pronunciation": pronunciation,
            "tags": self._classify_tags(transcript, confidence),
            "generatedAt": datetime.utcnow().isoformat() + "Z",
        }

    def _build_ai_feedback(
        self,
        transcript: str,
        confidence: float,
        metrics: Dict[str, Any],
        pronunciation: Dict[str, Any],
    ) -> Dict[str, Any]:
        words = transcript.split()
        if not transcript.strip() or len(words) == 0:
            return {
                "text": "Nenhuma fala detectada. Grave sua resposta para receber feedback.",
                "comprehensible": False,
                "suggestions": {
                    "clarity": "Nenhuma fala foi ouvida. Fale algo para que possamos avaliar.",
                    "rhythm": "Gravar o áudio é necessário para avaliar o ritmo.",
                    "organization": "Tente falar algumas frases para receber orientação de organização.",
                },
                "details": {
                    "wordsPerMinute": 0,
                    "pauseCount": 0,
                    "makesSense": False,
                    "language": "en-US",
                },
                "generatedAt": datetime.utcnow().isoformat() + "Z",
            }
        comprehensible = len(words) >= 4 and confidence >= 0.6
        lowered = f" {transcript.lower()} "
        verb_hints = [
            " am ",
            " is ",
            " are ",
            " was ",
            " were ",
            " be ",
            " been ",
            " have ",
            " has ",
            " do ",
            " does ",
            " did ",
            " go ",
            " went ",
            " like ",
            " want ",
            " need ",
            " can ",
            " will ",
        ]
        makes_sense = len(words) >= 4 and any(verb in lowered for verb in verb_hints)
        low_confidence_words = pronunciation.get("lowConfidenceWords", [])
        clarity = (
            "Algumas palavras ficaram mais dificeis de entender: "
            f"{', '.join(low_confidence_words[:5])}. Fale um pouco mais devagar "
            "e abra mais a boca nas silabas."
            if low_confidence_words
            else "Sua fala ficou clara. Mantenha esse jeito de falar."
        )
        words_per_minute = metrics.get("wordsPerMinute", 0)
        pause_count = metrics.get("pauseCount", 0)
        if words_per_minute >= 160:
            rhythm = "Voce falou bem rapido. Tente dar pequenas pausas para respirar."
        elif words_per_minute > 0 and words_per_minute < 80:
            rhythm = "Voce falou bem devagar. Tente manter um ritmo mais continuo."
        else:
            rhythm = "Seu ritmo ficou bom. Continue assim."
        organization = (
            "Tente responder em 2 ou 3 frases, como se estivesse contando algo para alguem."
            if len(words) < 8
            else "Sua resposta esta organizada. Tente ligar as ideias com frases curtas."
        )
        text = (
            "Deu para entender sua resposta! Se quiser, regrave usando as dicas abaixo "
            "para ficar ainda melhor."
            if comprehensible
            else "Ainda ficou dificil de entender. Regrave com calma usando as dicas abaixo."
        )
        return {
            "text": text,
            "comprehensible": comprehensible,
            "suggestions": {
                "clarity": clarity,
                "rhythm": rhythm,
                "organization": organization,
            },
            "details": {
                "wordsPerMinute": words_per_minute,
                "pauseCount": pause_count,
                "makesSense": makes_sense,
                "language": "en-US",
            },
            "generatedAt": datetime.utcnow().isoformat() + "Z",
        }

    def _generate_vertex_feedback(
        self,
        transcript: str,
        confidence: float,
        metrics: Dict[str, Any],
        pronunciation: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not transcript.strip():
            return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)
        if not self._vertex_model:
            return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)

        prompt = (
            "Voce e um professor de ingles americano. Gere um feedback curto e formativo em portugues "
            "para um aluno, com tom encorajador. Use a transcricao e os dados abaixo. "
            "Indique se a resposta foi compreensivel, se a frase faz sentido, e forneca dicas praticas "
            "em tres areas: clareza, ritmo e organizacao.\n\n"
            f"Transcricao: {transcript or '[vazia]'}\n"
            f"Confianca media: {round(confidence, 2)}\n"
            f"Palavras por minuto: {metrics.get('wordsPerMinute', 0)}\n"
            f"Pausas longas: {metrics.get('pauseCount', 0)}\n"
            f"Palavras com baixa confianca: {', '.join(pronunciation.get('lowConfidenceWords', []))}\n\n"
            "Responda APENAS com um JSON no formato:\n"
            "{\n"
            "  \"text\": \"...\",\n"
            "  \"comprehensible\": true/false,\n"
            "  \"suggestions\": {\n"
            "    \"clarity\": \"...\",\n"
            "    \"rhythm\": \"...\",\n"
            "    \"organization\": \"...\"\n"
            "  },\n"
            "  \"details\": {\n"
            "    \"wordsPerMinute\": number,\n"
            "    \"pauseCount\": number,\n"
            "    \"makesSense\": true/false,\n"
            "    \"language\": \"en-US\"\n"
            "  }\n"
            "}\n"
        )

        try:
            response = self._vertex_model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    temperature=0.2,
                    top_p=0.8,
                    max_output_tokens=512,
                ),
            )
            raw_text = response.text if hasattr(response, "text") else ""
            if not raw_text:
                return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)
            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                start = raw_text.find("{")
                end = raw_text.rfind("}")
                if start == -1 or end == -1 or end <= start:
                    return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)
                data = json.loads(raw_text[start : end + 1])

            data.setdefault("details", {})
            data["details"].setdefault("wordsPerMinute", metrics.get("wordsPerMinute", 0))
            data["details"].setdefault("pauseCount", metrics.get("pauseCount", 0))
            data["details"].setdefault("language", "en-US")
            if "makesSense" not in data["details"]:
                lowered = f" {transcript.lower()} "
                verb_hints = [
                    " am ",
                    " is ",
                    " are ",
                    " was ",
                    " were ",
                    " be ",
                    " been ",
                    " have ",
                    " has ",
                    " do ",
                    " does ",
                    " did ",
                    " go ",
                    " went ",
                    " like ",
                    " want ",
                    " need ",
                    " can ",
                    " will ",
                ]
                data["details"]["makesSense"] = len(transcript.split()) >= 4 and any(
                    verb in lowered for verb in verb_hints
                )
            if transcript.strip() and isinstance(data.get("text"), str):
                normalized_text = data["text"].strip().lower()
                if "nenhuma fala" in normalized_text or "no speech" in normalized_text:
                    return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)
            data.setdefault("generatedAt", datetime.utcnow().isoformat() + "Z")
            return data
        except Exception:  # pylint: disable=broad-except
            LOGGER.exception("Failed to generate Vertex feedback")
            return self._build_ai_feedback(transcript, confidence, metrics, pronunciation)

    def _classify_tags(self, transcript: str, confidence: float) -> Dict[str, str]:
        if not transcript:
            return {
                "comprehension": "nao compreendido",
                "vocabulary": "precisa praticar",
                "fluency": "praticar novamente",
            }

        comprehension = "foi compreendido" if confidence > 0.7 else "precisa reforcar"
        vocabulary = "bom vocabulario" if len(set(transcript.lower().split())) > 60 else "precisa melhorar vocabulario"
        fluency = "praticar ritmo" if confidence < 0.6 else "bom ritmo"

        return {
            "comprehension": comprehension,
            "vocabulary": vocabulary,
            "fluency": fluency,
        }

    def _persist_results(
        self,
        payload: TaskPayload,
        transcript: str,
        feedback: Dict[str, Any],
        ai_feedback: Dict[str, Any],
        word_timings: List[Dict[str, Any]],
        export_uri: str | None,
    ) -> None:
        doc_ref = self._firestore.collection("attempts").document(payload.attempt_id)
        doc_ref.set(
            {
                "attemptId": payload.attempt_id,
                "missionId": payload.mission_id,
                "status": "completed",
                "transcript": transcript,
                "feedback": feedback,
                "aiFeedback": ai_feedback,
                "wordTimings": word_timings,
                "exportUri": export_uri,
                "updatedAt": datetime.utcnow().isoformat() + "Z",
            },
            merge=True,
        )
        LOGGER.info("Stored feedback for attempt %s", payload.attempt_id)

    def _export_transcript(self, payload: TaskPayload, transcript: str) -> str | None:
        if not payload.storage_uri or not transcript:
            return None
        bucket_name, _ = self._parse_gs_uri(payload.storage_uri)
        if not bucket_name:
            return None
        try:
            bucket = self._storage.bucket(bucket_name)
            blob = bucket.blob(f"exports/antconc/{payload.attempt_id}.txt")
            blob.upload_from_string(transcript, content_type="text/plain; charset=utf-8")
            return f"gs://{bucket_name}/{blob.name}"
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.warning(
                "Failed to export transcript to Cloud Storage for attempt %s, continuing without export: %s",
                payload.attempt_id,
                error,
            )
            return None

    def _parse_gs_uri(self, uri: str) -> Tuple[str | None, str | None]:
        if not uri.startswith("gs://"):
            return None, None
        without_scheme = uri.replace("gs://", "", 1)
        parts = without_scheme.split("/", 1)
        bucket_name = parts[0] if parts else None
        object_name = parts[1] if len(parts) > 1 else None
        return bucket_name, object_name


app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.post("/tasks")
def handle_task_endpoint() -> Any:
    try:
        payload = TaskPayload.from_dict(request.get_json(force=True))
        LOGGER.info("Received task for attempt %s", payload.attempt_id)
        result = SpeechProcessor().process(payload)
        if payload.return_feedback and isinstance(result, dict):
            return jsonify(result)
        return jsonify({"status": "ok"})
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Failed to process task")
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/tasks", methods=["OPTIONS"])
def handle_task_options() -> Any:
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.getenv("WORKER_PORT", "8081"))
    app.run(host="0.0.0.0", port=port, debug=False)