"""VoiceUp speech processing worker.

Accepts Cloud Tasks payloads, downloads audio, performs transcription, derives
feedback metrics, and stores results back to Firestore.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Tuple

from google.cloud import firestore, speech, storage
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)


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

    def process(self, payload: TaskPayload) -> Dict[str, Any] | None:
        LOGGER.info("Processing attempt %s", payload.attempt_id)
        audio = self._build_audio(payload)
        config_kwargs: Dict[str, Any] = {
            "language_code": payload.language_code,
            "enable_automatic_punctuation": True,
            "enable_word_time_offsets": True,
            "enable_word_confidence": True,
            "model": "latest_long",
            "audio_channel_count": 1,
        }
        if payload.audio_content:
            config_kwargs["encoding"] = self._resolve_encoding(payload.audio_encoding)
            config_kwargs["sample_rate_hertz"] = payload.sample_rate_hertz
        config = speech.RecognitionConfig(**config_kwargs)

        operation = self._speech_client.long_running_recognize(config=config, audio=audio)
        response = operation.result(timeout=600)

        transcript_text, word_timings = self._build_transcript(response)
        avg_confidence = self._average_confidence(response)
        metrics = self._build_metrics(word_timings)
        pronunciation = self._analyze_pronunciation(word_timings)
        feedback = self._build_feedback(transcript_text, avg_confidence, metrics, pronunciation)
        export_uri = self._export_transcript(payload, transcript_text)
        self._persist_results(payload, transcript_text, feedback, word_timings, export_uri)

        return {
            "transcript": transcript_text,
            "feedback": feedback,
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
        bucket = self._storage.bucket(bucket_name)
        blob = bucket.blob(f"exports/antconc/{payload.attempt_id}.txt")
        blob.upload_from_string(transcript, content_type="text/plain; charset=utf-8")
        return f"gs://{bucket_name}/{blob.name}"

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
    example_payload = {
        "attemptId": "att_123",
        "storageUri": "gs://voiceup-recordings/raw/mock.webm",
        "missionId": "mission_abc",
    }
    with app.test_client() as client:
        client.post("/tasks", data=json.dumps(example_payload), content_type="application/json")