import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

// Lazy initialize Gemini Client to prevent crash if key is missing on startup
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Pre-packaged static offline data for Sample Tour Intercepts (bypasses 429 Quotas completely!)
const PREPACKAGED_ANALYSIS: Record<string, any> = {
  eiffel: {
    landmarkName: "Eiffel Tower",
    location: "Paris, France",
    approxCoords: "48.8584° N, 2.2945° E",
    shortDescription: "The stunning centerpiece of the Paris skyline, completed in 1889 as the entrance arch for the World's Fair.",
    arHotspots: [
      {
        title: "Tower Spire",
        description: "At 330 meters tall, this spire features radio transmitters and offers iconic panoramas of Paris.",
        x: 50,
        y: 15
      },
      {
        title: "Second Platform",
        description: "Home to the famous Jules Verne Michelin-star restaurant and telescopes for city stargazing.",
        x: 50,
        y: 55
      },
      {
        title: "Iron Lattice Pillars",
        description: "Constructed from 18,000 puddle iron pieces, held together by 2.5 million rivets.",
        x: 42,
        y: 85
      }
    ]
  },
  colosseum: {
    landmarkName: "Colosseum",
    location: "Rome, Italy",
    approxCoords: "41.8902° N, 12.4922° E",
    shortDescription: "The monumental Flavian Amphitheatre, a symbol of Rome's imperial power and engineering ambition.",
    arHotspots: [
      {
        title: "Outer Arcade Wall",
        description: "Built of travertine stones held together without mortar, using iron clamps.",
        x: 25,
        y: 30
      },
      {
        title: "Arena Floor",
        description: "The wooden floor was once covered in sand (arena) to soak up gladiatorial blood.",
        x: 50,
        y: 70
      },
      {
        title: "The Hypogeum",
        description: "The complex network of tunnels and trapdoors beneath the arena floor used to hold wild beasts.",
        x: 75,
        y: 65
      }
    ]
  },
  taj: {
    landmarkName: "Taj Mahal",
    location: "Agra, India",
    approxCoords: "27.1751° N, 78.0421° E",
    shortDescription: "An exquisite white-marble jewel of Mughal art, built as a monument to eternal love.",
    arHotspots: [
      {
        title: "Onion Dome",
        description: "The majestic central marble dome, reaching a spectacular height of 35 meters.",
        x: 50,
        y: 28
      },
      {
        title: "Pietra Dura Inlays",
        description: "The walls are inlaid with semi-precious stones forming complex floral motifs.",
        x: 48,
        y: 55
      },
      {
        title: "Reflecting Pool",
        description: "Perfectly aligned to reflect the symmetrical monument, creating a visual mirage of heaven.",
        x: 50,
        y: 88
      }
    ]
  }
};

const PREPACKAGED_HISTORY: Record<string, any> = {
  eiffel: {
    detailedHistory: "Designed by Gustave Eiffel for the 1889 Exposition Universelle, the tower was originally hated by Paris's artistic elite, who called it a 'giant black smokestack'. Intended to be dismantled after 20 years, Gustave saved it by adding a radio telegraph transmitter on the top, proving its immense scientific value.\n\nDuring World War I, it intercepted key enemy transmissions, and today, it is the most-visited paid monument in the world, standing as a globally recognized symbol of French cultural heritage and engineering brilliance.",
    visitingHours: "Open daily from 9:30 AM to 11:45 PM. Tickets to the summit start at €28. Booking online weeks in advance is highly recommended.",
    didYouKnow: "The Eiffel Tower actually grows! Due to thermal expansion of the puddle iron, the tower can swell up to 15 centimeters (6 inches) taller during hot summer days.",
    sources: [
      { title: "Official Eiffel Tower Site", uri: "https://www.toureiffel.paris/" },
      { title: "La Tour Eiffel History", uri: "https://www.toureiffel.paris/en/the-monument/history" }
    ]
  },
  colosseum: {
    detailedHistory: "Commissioned around AD 70-72 by Emperor Vespasian of the Flavian dynasty, the Colosseum was built as a gift to the Roman citizens. It could hold over 50,000 spectators who watched dramatic gladiatorial combats, wild animal hunts, and mock sea battles which involved flooding the entire arena floor.\n\nConstructed using concrete and stone, it was the largest amphitheatre of its time. It remained active for four centuries until the fall of the Western Roman Empire. Today, it stands as one of the New Seven Wonders of the World, reflecting both the glory and cruelty of ancient Rome.",
    visitingHours: "Open daily from 8:30 AM to one hour before sunset. General admission tickets are €16. Standard reservation is mandatory.",
    didYouKnow: "The Colosseum was originally covered in a giant retractable canvas awning called the Velarium, operated by seasoned Roman sailors, to shield spectators from the scorching Italian sun.",
    sources: [
      { title: "Parco Archeologico del Colosseo", uri: "https://parcocolosseo.it/" },
      { title: "Colosseum History & Architecture", uri: "https://www.britannica.com/topic/Colosseum" }
    ]
  },
  taj: {
    detailedHistory: "The Taj Mahal was commissioned in 1631 by the Mughal Emperor Shah Jahan to house the tomb of his favorite wife, Mumtaz Mahal, who died giving birth to their fourteenth child. Over 20,000 stone carvers, artists, and builders from across Asia spent more than 20 years constructing this architectural masterpiece.\n\nCrafted from Makrana marble that appears to change color depending on the daylight, the site represents the pinnacle of Mughal architecture, blending Islamic, Persian, and Indian artistic traditions in absolute, flawless symmetry.",
    visitingHours: "Open daily except Fridays, from 30 minutes before sunrise to 30 minutes after sunset. Entry is ₹1100 for foreign tourists.",
    didYouKnow: "To protect the main marble mausoleum from collapsing on itself during earthquakes, the four surrounding minarets were deliberately built tilting slightly outwards.",
    sources: [
      { title: "Taj Mahal Official Website", uri: "https://www.tajmahal.gov.in/" },
      { title: "UNESCO World Heritage - Taj Mahal", uri: "https://whc.unesco.org/en/list/252" }
    ]
  }
};

async function startServer() {
  const app = express();

  // Increase body size limit to support full resolution photos (base64)
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // API Route: 1. Image Recognition via gemini-3.1-pro-preview / gemini-3.5-flash / fallback
  app.post("/api/landmark/analyze", async (req, res) => {
    try {
      const { image, sampleId } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Check for Sample intercept first
      if (sampleId && PREPACKAGED_ANALYSIS[sampleId]) {
        console.log(`Bypassing API: serving prepackaged analysis for ${sampleId}`);
        return res.json({ ...PREPACKAGED_ANALYSIS[sampleId], isPrepackaged: true });
      }

      // Check if image is standard base64 and extract pure base64 data
      let base64Data = image;
      let mimeType = "image/jpeg";
      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const prompt = `Identify this landmark, historic building, monument, or geographical site. 
If it is a recognized tourist site, identify it and locate it.
Provide its exact location (City, Country), approximate latitude and longitude, a short 1-sentence description, 
and list 3 interactive, visually distinct points/features directly on the photo (e.g. key dome, historical clock, prominent arches, or unique decorations) with their exact relative X and Y coordinate percentage positions (0 to 100) where they appear on this image.`;

      const schemaConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            landmarkName: {
              type: Type.STRING,
              description: "Name of the landmark (e.g. 'Eiffel Tower', 'Colosseum'). If completely unrecognized, return 'Unknown Landmark'.",
            },
            location: {
              type: Type.STRING,
              description: "City and Country, e.g., 'Rome, Italy' or 'San Francisco, USA'",
            },
            approxCoords: {
              type: Type.STRING,
              description: "Latitude and Longitude representation, e.g. '41.8902° N, 12.4922° E'",
            },
            shortDescription: {
              type: Type.STRING,
              description: "A captivating, introductory 1-sentence description of the landmark.",
            },
            arHotspots: {
              type: Type.ARRAY,
              description: "An array of exactly 3 distinct features visible on this specific photo to place AR pins.",
              items: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "Short title of the point of interest, e.g. 'Flavian Arena floor' or 'Upper Archway'",
                  },
                  description: {
                    type: Type.STRING,
                    description: "A fascinating 1-2 sentence tidbit about this specific feature.",
                  },
                  x: {
                    type: Type.NUMBER,
                    description: "Horizontal coordinate percentage (0 - 100) of this spot relative to the image canvas.",
                  },
                  y: {
                    type: Type.NUMBER,
                    description: "Vertical coordinate percentage (0 - 100) of this spot relative to the image canvas.",
                  },
                },
                required: ["title", "description", "x", "y"],
              },
            },
          },
          required: ["landmarkName", "location", "approxCoords", "shortDescription", "arHotspots"],
        },
      };

      let responseText = "";
      try {
        const ai = getGeminiClient();
        console.log("Attempting landmark analysis with gemini-3.1-pro-preview...");
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            {
              text: prompt,
            },
          ],
          config: schemaConfig,
        });
        responseText = response.text || "";
      } catch (proError: any) {
        console.warn("gemini-3.1-pro-preview failed. Trying gemini-3.5-flash...", proError.message);
        try {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
            config: schemaConfig,
          });
          responseText = response.text || "";
        } catch (flashError: any) {
          console.error("Both models failed due to quota/network. Triggering smart local fallback...");
          // Graceful fallback for custom photos when quota is completely exhausted
          return res.json({
            landmarkName: "Custom Historic Landmark",
            location: "Explorer Destination",
            approxCoords: "45.0000° N, 90.0000° W",
            shortDescription: "A magnificent structural treasure scanned on your tour.",
            arHotspots: [
              {
                title: "Primary Facade",
                description: "The beautiful structural entrance showing remarkable historical architectural elements.",
                x: 50,
                y: 35
              },
              {
                title: "Scenic Vantage Point",
                description: "The optimal angle for captures, popular among cultural preservationists.",
                x: 35,
                y: 60
              },
              {
                title: "Decorative Detail",
                description: "A closer look reveals intricate carvings and masonry crafted by master artisans of the era.",
                x: 65,
                y: 55
              }
            ],
            isFallback: true,
            fallbackWarning: "Your Gemini API Key is currently experiencing free-tier quota exhaustion. We've gracefully generated this beautiful simulated AR tour so you can still preview the scanning HUD, hot-spot markers, audio, and passport stamps!"
          });
        }
      }

      if (!responseText) {
        throw new Error("Empty response from landmark analyzer model.");
      }

      const result = JSON.parse(responseText.trim());
      res.json(result);
    } catch (error: any) {
      console.error("Landmark Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // API Route: 2. Search Grounded History via gemini-3.5-flash
  app.post("/api/landmark/history", async (req, res) => {
    try {
      const { landmarkName, location, sampleId } = req.body;
      if (!landmarkName) {
        return res.status(400).json({ error: "No landmark name provided" });
      }

      // Check for Sample intercept first
      if (sampleId && PREPACKAGED_HISTORY[sampleId]) {
        console.log(`Bypassing API: serving prepackaged history for ${sampleId}`);
        return res.json(PREPACKAGED_HISTORY[sampleId]);
      }

      try {
        const ai = getGeminiClient();
        const searchPrompt = `Provide a comprehensive historical summary, visiting information, and a did you know trivia fact about the landmark "${landmarkName}" located in "${location || 'the world'}". Use search grounding to ensure exact accuracy.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: searchPrompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detailedHistory: {
                  type: Type.STRING,
                  description: "A highly educational, comprehensive 2-3 paragraph history of the landmark, citing details.",
                },
                visitingHours: {
                  type: Type.STRING,
                  description: "Modern opening hours, tickets, and entry tips, or 'No restriction / open public space' if outdoors.",
                },
                didYouKnow: {
                  type: Type.STRING,
                  description: "An incredibly surprising and lesser-known historical fun fact about the site.",
                },
              },
              required: ["detailedHistory", "visitingHours", "didYouKnow"],
            },
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response from history search model.");
        }

        const historyData = JSON.parse(text.trim());

        // Extract search grounding citations/sources to present to the user
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources = chunks
          .filter((chunk: any) => chunk.web && chunk.web.uri)
          .map((chunk: any) => ({
            title: chunk.web.title || "Grounding Source",
            uri: chunk.web.uri,
          }));

        // Deduplicate sources
        const uniqueSourcesMap: Record<string, string> = {};
        sources.forEach((s: any) => {
          uniqueSourcesMap[s.uri] = s.title;
        });
        const uniqueSources = Object.entries(uniqueSourcesMap).map(([uri, title]) => ({
          title,
          uri,
        }));

        res.json({
          ...historyData,
          sources: uniqueSources,
        });
      } catch (apiError: any) {
        console.warn("History search failed due to quota or error. Serving offline fallback history details...", apiError.message);
        res.json({
          detailedHistory: `This custom historical site is filled with structural and architectural wonders. Standard historical timelines indicate that sites of this form served as key meeting places, trading posts, or iconic monuments within their respective local civilizations.\n\nPreservationists and structural engineers continue to study these magnificent locations to understand the design choices, artisanal masonry, and ancient community values that enabled them to survive through centuries into the modern era.`,
          visitingHours: "Visiting hours vary, but typically open during daylight hours from 8:00 AM to 6:00 PM. Local admission tickets may apply depending on conservation efforts.",
          didYouKnow: "Many historical monuments were constructed using unique mortar mixes, including organic elements like molasses or egg whites, to reinforce structural strength against regional seismic activity!",
          sources: [
            { title: "World Monuments Fund", uri: "https://www.wmf.org/" },
            { title: "UNESCO Cultural Heritage Sites", uri: "https://whc.unesco.org/" }
          ],
          isFallback: true
        });
      }
    } catch (error: any) {
      console.error("Landmark History Error:", error);
      res.status(500).json({ error: error.message || "Failed to search history" });
    }
  });

  // API Route: 3. TTS Narration via gemini-3.1-flash-tts-preview
  app.post("/api/landmark/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text provided for narration" });
      }

      try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [
            {
              parts: [
                {
                  text: `Say enthusiastically and clearly: ${text}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore", // Kore is an amazing explorer-guide voice
                },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("No audio payload returned from TTS model.");
        }

        res.json({ audio: base64Audio });
      } catch (ttsError: any) {
        console.warn("Gemini TTS failed (likely quota limit). Signaling client to use local Web Speech synthesis.");
        // Return structured signal indicating the client should use its browser speech synthesis fallback
        res.json({ useWebSpeechFallback: true });
      }
    } catch (error: any) {
      console.error("Landmark TTS Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate voice narration" });
    }
  });

  // Serve static assets and frontend index.html
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
