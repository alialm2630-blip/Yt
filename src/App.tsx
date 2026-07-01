import React, { useState, useEffect } from "react";
import { Compass, Sparkles, AlertCircle, MapPin, Landmark, Award, BookOpen, RefreshCw } from "lucide-react";
import CameraCapture from "./components/CameraCapture";
import AROverlay from "./components/AROverlay";
import Passport from "./components/Passport";
import { TravelSession, LandmarkAnalysis, LandmarkHistory } from "./types";

type LoadingStep = "idle" | "analyzing" | "history" | "error";

// Beautiful Unsplash sample landmark photos for instant 1-click demonstration
const SAMPLE_LANDMARKS = [
  {
    id: "eiffel",
    name: "Eiffel Tower",
    location: "Paris, France",
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
    description: "The world-famous iron lattice tower on the Champ de Mars in Paris.",
  },
  {
    id: "colosseum",
    name: "Colosseum",
    location: "Rome, Italy",
    imageUrl: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80",
    description: "The largest ancient amphitheatre ever built, located in the center of Rome.",
  },
  {
    id: "taj",
    name: "Taj Mahal",
    location: "Agra, India",
    imageUrl: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=800&q=80",
    description: "An ivory-white marble mausoleum on the south bank of the Yamuna river.",
  },
];

// Utility to asynchronously compress a base64 image on client-side using a canvas
const compressBase64Image = (
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7
): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith("data:image")) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export default function App() {
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TravelSession[]>([]);
  const [activeSession, setActiveSession] = useState<TravelSession | null>(null);

  // Load saved travel passport sessions on mount with self-healing compression
  useEffect(() => {
    try {
      const saved = localStorage.getItem("photo_tourism_sessions");
      if (saved) {
        const parsed = JSON.parse(saved) as TravelSession[];
        
        // Self-heal: check if any historical sessions have heavy uncompressed images (> 150KB length)
        // and trigger background compression to clean up the user's storage quota!
        const needsHealing = parsed.some((s) => s.image && s.image.length > 200000);
        if (needsHealing) {
          console.log("Found heavy raw images in passport sessions. Triggering dynamic compression healing...");
          Promise.all(
            parsed.map(async (session) => {
              if (session.image && session.image.length > 200000) {
                try {
                  const compressed = await compressBase64Image(session.image, 800, 800, 0.7);
                  return { ...session, image: compressed };
                } catch (e) {
                  return session;
                }
              }
              return session;
            })
          ).then((healed) => {
            setSessions(healed);
            if (healed.length > 0) {
              setActiveSession(healed[0]);
            }
            try {
              localStorage.setItem("photo_tourism_sessions", JSON.stringify(healed));
              console.log("Passport sessions successfully healed and compressed!");
            } catch (err) {
              console.error("Failed to save healed sessions:", err);
            }
          });
        } else {
          setSessions(parsed);
          if (parsed.length > 0) {
            setActiveSession(parsed[0]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load travel history from local storage:", err);
    }
  }, []);

  // Save sessions to localStorage when updated with adaptive error resilience
  const saveSessions = (updated: TravelSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem("photo_tourism_sessions", JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to save travel history due to storage quota. Retrying with compressed/trimmed history...", err);
      // Fallback: Keep only the most recent 12 sessions to respect browser limits
      const trimmed = updated.slice(0, 12);
      try {
        localStorage.setItem("photo_tourism_sessions", JSON.stringify(trimmed));
        setSessions(trimmed);
      } catch (innerErr) {
        console.error("Critical: Storage quota exceeded even after trimming sessions. Clearing older entries...", innerErr);
        // Extreme fallback: trim to 5 most recent sessions
        const miniTrim = updated.slice(0, 5);
        try {
          localStorage.setItem("photo_tourism_sessions", JSON.stringify(miniTrim));
          setSessions(miniTrim);
        } catch (finalErr) {
          console.error("Failed to write to localStorage altogether:", finalErr);
        }
      }
    }
  };

  // Convert image URL to base64 for sample landmark simulation
  const fetchUrlAsBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Main core controller for processing pictures (captured or selected samples)
  const handleProcessImage = async (base64Image: string, sampleId?: string) => {
    setLoadingStep("analyzing");
    setErrorMessage(null);

    try {
      // Compress/downscale raw high-resolution captures or heavy file uploads right away
      // This protects local storage quota and minimizes network traffic
      const compressedImage = await compressBase64Image(base64Image, 800, 800, 0.7);

      // 1. Analyze the photo using gemini-3.1-pro-preview / fallback / mock intercept
      const analyzeRes = await fetch("/api/landmark/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressedImage, sampleId }),
      });

      if (!analyzeRes.ok) {
        const errJson = await analyzeRes.json();
        throw new Error(errJson.error || "Failed to identify landmark.");
      }

      const analysisData = (await analyzeRes.json()) as LandmarkAnalysis;

      if (analysisData.landmarkName === "Unknown Landmark" || !analysisData.landmarkName) {
        throw new Error(
          "We couldn't clearly recognize a landmark in this image. Try uploading a clearer, direct photo of a famous historical site or monument!"
        );
      }

      // 2. Fetch history with search grounding using gemini-3.5-flash
      setLoadingStep("history");
      const historyRes = await fetch("/api/landmark/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landmarkName: analysisData.landmarkName,
          location: analysisData.location,
          sampleId,
        }),
      });

      if (!historyRes.ok) {
        const errJson = await historyRes.json();
        throw new Error(errJson.error || "Failed to retrieve grounded history.");
      }

      const historyData = (await historyRes.json()) as LandmarkHistory;

      // 3. Complete and log travel session using the compact compressed image
      const newSession: TravelSession = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        image: compressedImage,
        analysis: analysisData,
        history: historyData,
      };

      const updatedSessions = [newSession, ...sessions];
      saveSessions(updatedSessions);
      setActiveSession(newSession);
      setLoadingStep("idle");
    } catch (err: any) {
      console.error("AI Tourism workflow error:", err);
      setErrorMessage(err.message || "An unexpected error occurred during processing.");
      setLoadingStep("idle");
    }
  };

  // Generate and return TTS voice clip base64 PCM on demand
  const handleRequestTts = async (text: string): Promise<string> => {
    const response = await fetch("/api/landmark/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to synthesize voice narration.");
    }

    const data = await response.json();
    if (data.useWebSpeechFallback) {
      return "WEB_SPEECH_FALLBACK";
    }
    return data.audio; // Base64 PCM or "WEB_SPEECH_FALLBACK"
  };

  // 1-Click Simulator for Sample Landmarks
  const handleSelectSample = async (sample: typeof SAMPLE_LANDMARKS[0]) => {
    setLoadingStep("analyzing");
    setErrorMessage(null);
    try {
      const base64 = await fetchUrlAsBase64(sample.imageUrl);
      await handleProcessImage(base64, sample.id);
    } catch (err: any) {
      console.error("Failed to load sample image:", err);
      setErrorMessage("Failed to process sample photo. Please check your internet connection.");
      setLoadingStep("idle");
    }
  };

  // Passport Stamp Controls
  const handleDeleteSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    saveSessions(updated);
    if (activeSession?.id === id) {
      setActiveSession(updated.length > 0 ? updated[0] : null);
    }
  };

  const handleClearAllSessions = () => {
    if (window.confirm("Are you sure you want to clear your travel stamps passport?")) {
      saveSessions([]);
      setActiveSession(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16" id="app-root-view">
      {/* Visual Header / Navigation banner */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-2 text-white shadow-md shadow-sky-500/15">
              <Compass className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Photo Tourism App
                <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-mono text-sky-600 uppercase tracking-widest">
                  Live AR Guide
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Snap landmarks to explore interactive visual hotspots with search-grounded history and audio tours.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Grid Layout */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side Column: Vision Scanner & Passport Stamps Log (4 grid columns) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Vision Scanner Card */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-500" /> Landmark scanner
            </h2>
            
            {loadingStep === "idle" && (
              <CameraCapture onCapture={handleProcessImage} isLoading={false} />
            )}

            {/* AI Holographic Processing State View */}
            {loadingStep !== "idle" && (
              <div className="aspect-video w-full rounded-2xl bg-slate-950 border border-slate-800 p-6 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden" id="ai-processing-hud">
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15)_0%,transparent_60%)]"></div>
                
                {/* Visual Spinning Gyro */}
                <div className="relative flex h-14 w-14 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-dashed border-sky-400/20 animate-spin" style={{ animationDuration: '8s' }} />
                  <div className="absolute inset-2 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
                  <Compass className="h-6 w-6 text-sky-400" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    {loadingStep === "analyzing" ? "Analyzing sight data..." : "Grounding history..."}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                    {loadingStep === "analyzing" 
                      ? "Gemini AI is reading image features and recognizing structural landmarks..." 
                      : "Sifting through deep Google Search grounding indexes for verified historical details..."}
                  </p>
                </div>

                {/* Simulated progress bar */}
                <div className="w-full max-w-[200px] bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className={`h-full bg-sky-500 transition-all duration-[3000ms] ${loadingStep === "analyzing" ? "w-[45%]" : "w-[90%]"}`}></div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-red-800">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">Sight Scan Advisory</h4>
                  <p className="text-xs leading-relaxed text-red-700">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Demo Simulator Stamps Panel */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2">
              <Compass className="h-4 w-4 text-indigo-500" /> Quick Demo Tours
            </h2>
            <p className="text-xs text-slate-500">
              No photo ready? Tap a historic landmark below to immediately simulate scanning it with our AI Tourism engine:
            </p>
            <div className="grid grid-cols-1 gap-3">
              {SAMPLE_LANDMARKS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  id={`sample-tour-${idx}`}
                  onClick={() => handleSelectSample(sample)}
                  disabled={loadingStep !== "idle"}
                  className="flex items-center gap-3 w-full rounded-xl border border-slate-100 p-2.5 hover:bg-slate-50 hover:border-slate-200 transition-all text-left group disabled:opacity-50 cursor-pointer"
                >
                  <img
                    src={sample.imageUrl}
                    alt={sample.name}
                    className="h-12 w-12 rounded-lg object-cover shrink-0 border border-slate-100"
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {sample.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 truncate">{sample.location}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side Column: AR Visualizer Viewport (8 grid columns) */}
        <div className="lg:col-span-8 space-y-8">
          
          {activeSession ? (
            <AROverlay
              key={activeSession.id}
              image={activeSession.image}
              analysis={activeSession.analysis}
              history={activeSession.history}
              ttsAudio={activeSession.ttsAudio}
              onTtsRequest={async (text) => {
                const audio = await handleRequestTts(text);
                // Cache synthesized voice clip base64 PCM in the current session
                const updatedSessions = sessions.map((s) =>
                  s.id === activeSession.id ? { ...s, ttsAudio: audio } : s
                );
                saveSessions(updatedSessions);
                setActiveSession({ ...activeSession, ttsAudio: audio });
                return audio;
              }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center space-y-6 flex flex-col items-center justify-center min-h-[460px]">
              <div className="rounded-full bg-slate-50 p-4 border border-slate-100">
                <Landmark className="h-10 w-10 text-slate-300" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-base font-bold text-slate-800">No Landmark Selected</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Take a photo of a tourist site with your camera, drop a picture in the scanner, or select one of our quick sample tours to activate the interactive AR holographic viewport!
                </p>
              </div>
            </div>
          )}

          {/* Traveler Passport Stamp Collection Shelf */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <Passport
              sessions={sessions}
              onSelect={setActiveSession}
              onDelete={handleDeleteSession}
              onClearAll={handleClearAllSessions}
              currentActiveId={activeSession?.id}
            />
          </div>

        </div>

      </main>
    </div>
  );
}
