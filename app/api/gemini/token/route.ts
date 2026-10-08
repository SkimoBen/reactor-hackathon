import { NextRequest, NextResponse } from "next/server";
import {
  AudioTranscriptionConfigMode,
  GoogleGenAI,
  Modality,
  type LiveConnectConfig,
} from "@google/genai";

/**
 * `/api/gemini/token` — mints a single-use Gemini Live ephemeral token for
 * the browser's transcription session.
 *
 * The browser streams mic audio straight to Gemini over a WebSocket, so it
 * needs a credential — but never GEMINI_API_KEY itself. The ephemeral token
 * is locked (`liveConnectConstraints`) to the transcription model and the
 * exact config returned here, valid for one session, and must open that
 * session within a minute. The client fetches a fresh one on every
 * (re)connect, including the rollover at Gemini's 10-minute session cap.
 *
 * POST `{ mode?: "SMART" | "VERBATIM", languages?: string[] }`
 *   → `{ token, model, apiVersion, config }`
 */

const MODEL =
  process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe-live";
// Google's docs say ephemeral tokens need v1beta; the SDK still warns that
// they're v1alpha-only. Override here if connects fail with a 404/1008.
const API_VERSION = process.env.GEMINI_API_VERSION || "v1beta";
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const NEW_SESSION_WINDOW_MS = 60 * 1000;
const MAX_LANGUAGES = 5;
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not set" },
      { status: 500 },
    );
  }

  let mode = AudioTranscriptionConfigMode.SMART;
  let languageCodes: string[] = [];
  try {
    const body = (await request.json()) as {
      mode?: string;
      languages?: unknown;
    };
    if (body.mode === "VERBATIM") mode = AudioTranscriptionConfigMode.VERBATIM;
    if (Array.isArray(body.languages)) {
      languageCodes = body.languages
        .map((code) => String(code).trim())
        .filter((code) => LANGUAGE_CODE.test(code))
        .slice(0, MAX_LANGUAGES);
    }
  } catch {
    // An empty body is fine: SMART mode, automatic language detection.
  }

  // SMART drops filler words and false starts, which makes the transcript a
  // better scene description. No language codes = automatic detection.
  const config: LiveConnectConfig = {
    responseModalities: [Modality.TEXT],
    inputAudioTranscription: {
      mode,
      ...(languageCodes.length > 0 ? { languageCodes } : {}),
    },
  };

  const now = Date.now();
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: API_VERSION },
    });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + TOKEN_LIFETIME_MS).toISOString(),
        newSessionExpireTime: new Date(
          now + NEW_SESSION_WINDOW_MS,
        ).toISOString(),
        liveConnectConstraints: { model: MODEL, config },
      },
    });
    if (!token.name) throw new Error("Gemini returned no token name");
    return NextResponse.json(
      { token: token.name, model: MODEL, apiVersion: API_VERSION, config },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gemini token request failed: ${message}` },
      { status: 502 },
    );
  }
}
