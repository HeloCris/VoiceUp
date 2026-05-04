import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecorderStatus } from '../components/RecorderControls';
import { getAuthHeaders } from '../firebase';

interface RecorderAPI {
  isSupported: boolean;
  status: RecorderStatus;
  recordingTime: number;
  audioUrl: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  upload: (missionId?: string, classId?: string) => Promise<UploadResult | null>;
}

export type UploadResult = {
  attemptId: string;
  status: string;
  transcript: string | null;
  feedback: {
    metrics: {
      wordCount?: number;
      wordsPerMinute: number;
      pauseCount: number;
      lexicalDiversity: number;
    };
    pronunciation: {
      lowConfidenceWords: string[];
      focusSounds?: string[];
    };
  } | null;
  aiFeedback: {
    text: string;
    comprehensible: boolean;
    suggestions: {
      clarity: string;
      rhythm: string;
      organization: string;
    };
    details: {
      wordsPerMinute: number;
      pauseCount: number;
      makesSense: boolean;
      language: 'en-US';
    };
    generatedAt: string;
  } | null;
};

const MAX_DURATION_SECONDS = 120;

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export default function useRecorder(): RecorderAPI {
  const isSupported = typeof MediaRecorder !== 'undefined';
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const stopClock = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopClock();
    setStatus('idle');
    setRecordingTime(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    chunksRef.current = [];
  }, [audioUrl, stopClock]);

  const startRecording = useCallback(async () => {
    if (!isSupported || status === 'recording') return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorderRef.current = recorder;
    setStatus('recording');
    setRecordingTime(0);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      stopClock();
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setStatus('review');
    };

    recorder.start();
    timerRef.current = window.setInterval(() => {
      setRecordingTime((prev: number) => {
        if (prev + 1 >= MAX_DURATION_SECONDS) {
          recorder.stop();
          return MAX_DURATION_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  }, [isSupported, status, stopClock]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [status]);

  const upload = useCallback(async (missionId?: string, classId?: string) => {
    if (!audioUrl) return null;
    const response = await fetch(audioUrl);
    const blob = await response.blob();
    const authHeaders = await getAuthHeaders();

    const createAttemptResponse = await fetch(`${API_URL}/v1/attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        missionId: missionId ?? 'local-mission',
        classId: classId ?? undefined,
        duration: Math.round(blob.size / 1000),
      }),
    });
    if (!createAttemptResponse.ok) {
      const errorText = await createAttemptResponse.text();
      throw new Error(`API ${createAttemptResponse.status}: ${errorText || 'attempt create failed'}`);
    }

    const createData = (await createAttemptResponse.json()) as {
      attemptId: string;
      uploadUrl: string;
      contentType: string;
    };

    const uploadResponse = await fetch(createData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': createData.contentType ?? 'audio/webm',
        ...authHeaders,
      },
      body: blob,
    });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload ${uploadResponse.status}: ${errorText || 'upload failed'}`);
    }

    const completeResponse = await fetch(`${API_URL}/v1/attempts/${createData.attemptId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ languageCode: 'en-US' }),
    });
    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      throw new Error(`Complete ${completeResponse.status}: ${errorText || 'complete failed'}`);
    }

    let attempts = 0;
    while (attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusResponse = await fetch(`${API_URL}/v1/attempts/${createData.attemptId}`, {
        headers: authHeaders,
      });
      if (!statusResponse.ok) {
        attempts += 1;
        continue;
      }
      const statusData = (await statusResponse.json()) as UploadResult;
      if (statusData.status === 'completed' || statusData.status === 'ready') {
        return statusData;
      }
      if (statusData.status === 'queued') {
        return {
          attemptId: createData.attemptId,
          status: 'queued',
          transcript: null,
          feedback: null,
          aiFeedback: null,
        };
      }
      attempts += 1;
    }

    return {
      attemptId: createData.attemptId,
      status: 'queued',
      transcript: null,
      feedback: null,
      aiFeedback: null,
    };
  }, [audioUrl]);

  return {
    isSupported,
    status,
    recordingTime,
    audioUrl,
    startRecording,
    stopRecording,
    reset,
    upload,
  };
}
