import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Compass, MapPin, Landmark, Clock, ExternalLink, Sparkles, BookOpen, Volume2, RefreshCw } from "lucide-react";
import { LandmarkAnalysis, LandmarkHistory } from "../types";

interface AROverlayProps {
  key?: string;
  image: string;
  analysis: LandmarkAnalysis;
  history: LandmarkHistory;
  ttsAudio?: string;
  onTtsRequest: (text: string) => Promise<string>;
}

export default function AROverlay({ image, analysis, history, ttsAudio, onTtsRequest }: AROverlayProps) {
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [subtitles, setSubtitles] = useState<string[]>([]);
  const [currentSubtitleIdx, setCurrentSubtitleIdx] = useState(0);

  // Fallback for native Web Speech API Synthesis when cloud TTS fails/quota limit
  const [useWebSpeech, setUseWebSpeech] = useState(false);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Formulate immersive tour narration script
  const narrationScript = `Welcome to the historic ${analysis.landmarkName} in ${analysis.location}! Located approximately at ${analysis.approxCoords}. ${analysis.shortDescription} Feel free to explore the interactive holographic hot-spots glowing on your terminal view screen, and read our deep search-grounded report below to discover hours, tickets, and fun facts!`;

  // Segment script into 4 main subtitle tracks for engaging AR display
  useEffect(() => {
    const tracks = [
      `Welcome to the historic ${analysis.landmarkName} in ${analysis.location}!`,
      `Located approximately at coordinates: ${analysis.approxCoords}.`,
      `${analysis.shortDescription}`,
      `Tap the interactive holographic AR pins on your screen to learn more, or view the history below!`
    ];
    setSubtitles(tracks);
  }, [analysis]);

  // Handle subtitle cycling based on playback time
  useEffect(() => {
    if (isPlaying) {
      const totalDuration = useWebSpeech ? 18 : (audioBufferRef.current?.duration || 18);
      const quarter = totalDuration / 4;
      const index = Math.min(3, Math.floor(playbackTime / quarter));
      setCurrentSubtitleIdx(index);
    } else {
      setCurrentSubtitleIdx(0);
    }
  }, [playbackTime, isPlaying, useWebSpeech]);

  // Decode Base64 PCM data to AudioBuffer
  const loadAudioBuffer = (base64PCM: string) => {
    if (base64PCM === "WEB_SPEECH_FALLBACK") {
      setUseWebSpeech(true);
      setAudioLoaded(true);
      return;
    }

    try {
      setUseWebSpeech(false);
      const binary = atob(base64PCM);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = ctx.createBuffer(1, int16Array.length, 24000);
      const channelData = buffer.getChannelData(0);

      for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0; // Normalize
      }

      audioBufferRef.current = buffer;
      audioCtxRef.current = ctx;
      setAudioLoaded(true);
    } catch (err) {
      console.error("PCM decoding error, falling back to Web Speech:", err);
      setUseWebSpeech(true);
      setAudioLoaded(true);
    }
  };

  // Load audio if already present
  useEffect(() => {
    if (ttsAudio) {
      loadAudioBuffer(ttsAudio);
    }
  }, [ttsAudio]);

  // Auto load/generate speech clip
  const handleGenerateVoice = async () => {
    if (audioLoaded || isLoadingAudio) return;
    setIsLoadingAudio(true);
    try {
      const base64PCM = await onTtsRequest(narrationScript);
      loadAudioBuffer(base64PCM);
    } catch (error) {
      console.error("Voice generation failed, switching to native speech synthesis:", error);
      setUseWebSpeech(true);
      setAudioLoaded(true);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  // Keep track of playtime
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const startRealTime = Date.now() - (pauseOffsetRef.current * 1000);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRealTime) / 1000;
      const totalDuration = useWebSpeech ? 18 : (audioBufferRef.current?.duration || 18);
      
      if (elapsed >= totalDuration) {
        handleStop();
      } else {
        setPlaybackTime(elapsed);
      }
    }, 100);
  };

  const handlePlay = async () => {
    if (!audioLoaded) {
      await handleGenerateVoice();
    }

    if (useWebSpeech) {
      try {
        window.speechSynthesis.cancel();
        
        // If already speaking and paused, resume it
        if (speechUtteranceRef.current && isPlaying === false && playbackTime > 0) {
          window.speechSynthesis.resume();
          setIsPlaying(true);
          startTimer();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(narrationScript);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
          setIsPlaying(false);
          setPlaybackTime(0);
          pauseOffsetRef.current = 0;
          if (timerRef.current) clearInterval(timerRef.current);
        };

        utterance.onerror = () => {
          setIsPlaying(false);
          if (timerRef.current) clearInterval(timerRef.current);
        };

        speechUtteranceRef.current = utterance;
        setIsPlaying(true);
        startTimer();
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("Web Speech synthesis failed:", err);
      }
      return;
    }

    if (!audioBufferRef.current || !audioCtxRef.current) return;

    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioCtxRef.current.destination);

    source.start(0, pauseOffsetRef.current);
    startTimeRef.current = audioCtxRef.current.currentTime - pauseOffsetRef.current;
    sourceNodeRef.current = source;
    setIsPlaying(true);
    startTimer();
  };

  const handlePause = () => {
    if (useWebSpeech) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
      pauseOffsetRef.current = playbackTime;
      return;
    }

    if (sourceNodeRef.current && audioCtxRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current = null;
      pauseOffsetRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleStop = () => {
    if (useWebSpeech) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    pauseOffsetRef.current = 0;
    setPlaybackTime(0);
    setIsPlaying(false);
    setCurrentSubtitleIdx(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="space-y-8" id="ar-overlay-view">
      {/* Immersive CSS animation injection */}
      <style>{`
        @keyframes kenburns {
          0% {
            transform: scale(1) translate(0, 0);
          }
          50% {
            transform: scale(1.15) translate(-1.5%, 1%);
          }
          100% {
            transform: scale(1) translate(0, 0);
          }
        }
        .ken-burns-active {
          animation: kenburns 22s ease-in-out infinite;
        }
        @keyframes radar-ripple {
          0% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        .ar-pulse-ripple {
          animation: radar-ripple 2s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
        }
      `}</style>

      {/* Fallback resilient notice banner */}
      {analysis.fallbackWarning && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-4 text-amber-900 shadow-sm flex items-start gap-3" id="fallback-quota-disclaimer">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider font-mono">Resilient Simulation Mode Active</h4>
            <p className="text-xs leading-relaxed text-amber-800">{analysis.fallbackWarning}</p>
          </div>
        </div>
      )}

      {/* Main Holographic AR Visualizer Card */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-2xl border border-slate-800">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-sky-400">
          <Compass className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '6s' }} />
          AR HUD Interface
        </div>

        {/* Cinematic Ken-burns Photo Stage */}
        <div className="relative aspect-video w-full overflow-hidden flex items-center justify-center">
          <img
            src={image}
            alt={analysis.landmarkName}
            className={`h-full w-full object-cover transition-transform duration-[4000ms] ease-out ${
              isPlaying ? "ken-burns-active" : ""
            }`}
          />

          {/* AR HUD Grid Grid Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(15,23,42,0.4)_90%)] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]"></div>

          {/* Hotspot absolute-positioned AR Pins */}
          {analysis.arHotspots.map((hotspot, idx) => (
            <div
              key={idx}
              id={`hotspot-pin-${idx}`}
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group"
            >
              {/* Radar Ripple Effect */}
              <div className="absolute inset-0 rounded-full bg-sky-400/60 ar-pulse-ripple pointer-events-none" />

              {/* Central Glowing Pin Node */}
              <button
                type="button"
                onClick={() => setActiveHotspot(activeHotspot === idx ? null : idx)}
                className={`relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-lg transition-all duration-300 cursor-pointer ${
                  activeHotspot === idx ? "bg-sky-400 scale-125 ring-4 ring-sky-500/30" : "bg-slate-900 hover:bg-sky-500"
                }`}
              >
                <span className="text-[10px] font-bold text-white">{idx + 1}</span>
              </button>

              {/* Translucent Hotspot Detail Tooltip Popup Card */}
              <div
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 w-56 p-3 rounded-xl border bg-slate-900/90 backdrop-blur-md text-white shadow-xl pointer-events-none transition-all duration-300 ${
                  activeHotspot === idx
                    ? "opacity-100 translate-y-0 scale-100"
                    : "opacity-0 translate-y-2 scale-95 pointer-events-none"
                } border-slate-700/60`}
              >
                <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-slate-700/60 rotate-45"></div>
                <h4 className="text-xs font-bold text-sky-300 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-sky-400" />
                  {hotspot.title}
                </h4>
                <p className="text-[10px] text-slate-300 leading-normal mt-1">
                  {hotspot.description}
                </p>
              </div>
            </div>
          ))}

          {/* Panoramic Live AR Subtitles Overlay */}
          <div className="absolute bottom-4 left-6 right-6 z-20 flex flex-col items-center">
            <div className="w-full max-w-xl text-center rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800/80 px-4 py-2 text-xs font-medium text-white shadow-lg min-h-[44px] flex items-center justify-center">
              <p className="transition-all duration-300 tracking-wide leading-relaxed text-slate-100">
                {isPlaying ? subtitles[currentSubtitleIdx] : "Holographic Narrator Standby. Press Play to listen."}
              </p>
            </div>
          </div>
        </div>

        {/* Clip Control Panel */}
        <div className="border-t border-slate-800 bg-slate-900/95 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-800 p-2 border border-slate-700">
              <Landmark className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-none">{analysis.landmarkName}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" /> {analysis.location} • <span className="font-mono text-[10px]">{analysis.approxCoords}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Playback Controls */}
            {isPlaying ? (
              <button
                type="button"
                onClick={handlePause}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all cursor-pointer shadow-md shadow-amber-500/10"
              >
                <Pause className="h-3.5 w-3.5" /> Pause Tour
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                disabled={isLoadingAudio}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-sky-500/10"
              >
                {isLoadingAudio ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Synthesizing Voice...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> {audioLoaded ? "Play Tour" : "Listen Narration"}
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleStop}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 transition-all cursor-pointer"
              title="Stop Tour"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Historical dossier & visitor card (Bento style grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core History Dossier */}
        <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
            <div className="rounded-full bg-slate-100 p-1.5 text-slate-600">
              <BookOpen className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider font-mono">
              Historical dossier
            </h3>
          </div>
          <div className="text-slate-600 text-sm leading-relaxed space-y-3">
            {history.detailedHistory.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {/* Citation / Google Search Grounding Sources */}
          {history.sources && history.sources.length > 0 && (
            <div className="border-t border-slate-100 pt-4 mt-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-2.5">
                Google Search Grounding Sources
              </h4>
              <div className="flex flex-wrap gap-2">
                {history.sources.map((source, idx) => (
                  <a
                    key={idx}
                    href={source.uri}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-300 px-3 py-1 text-xs text-slate-600 transition-all shadow-sm"
                  >
                    <ExternalLink className="h-3 w-3 text-sky-500" />
                    <span className="max-w-[160px] truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Visitor log, coordinates, and "Did You Know" */}
        <div className="space-y-6">
          {/* Quick visit card */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6 shadow-inner space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="rounded-full bg-sky-100 p-1.5 text-sky-600">
                <Clock className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider font-mono">
                Visiting Information
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {history.visitingHours}
            </p>
          </div>

          {/* Did You Know Trivia Card */}
          <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-xl space-y-3 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-yellow-300 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-sky-200">
                Did You Know?
              </h3>
            </div>
            <p className="text-xs leading-relaxed font-medium">
              {history.didYouKnow}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
