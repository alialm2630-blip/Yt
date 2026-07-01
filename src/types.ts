export interface LandmarkHotspot {
  title: string;
  description: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
}

export interface LandmarkAnalysis {
  landmarkName: string;
  location: string;
  approxCoords: string;
  shortDescription: string;
  arHotspots: LandmarkHotspot[];
  isFallback?: boolean;
  fallbackWarning?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface LandmarkHistory {
  detailedHistory: string;
  visitingHours: string;
  didYouKnow: string;
  sources: GroundingSource[];
}

export interface TravelSession {
  id: string;
  timestamp: number;
  image: string; // base64 image data
  analysis: LandmarkAnalysis;
  history: LandmarkHistory;
  ttsAudio?: string; // base64 encoded raw PCM audio
}
