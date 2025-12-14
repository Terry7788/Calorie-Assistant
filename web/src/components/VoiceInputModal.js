"use client";

import { useState, useEffect, useRef } from "react";
import { API } from "../lib/api";

export default function VoiceInputModal({ isOpen, onClose, onFoodParsed, buttonPosition }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const animationFrameRef = useRef(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const speechTimeoutRef = useRef(null);

  const [isClosing, setIsClosing] = useState(false);
  const wasOpenRef = useRef(false);
  const modalIdRef = useRef(`voice-modal-${Date.now()}`);

  // Reset to "From Database" tab when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      setIsClosing(false);
    } else if (wasOpenRef.current) {
      // Only trigger closing animation if modal was previously open
      setIsClosing(true);
      wasOpenRef.current = false;
      // Delay cleanup to allow closing animation
      const timer = setTimeout(() => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            // Ignore errors when stopping
          }
          recognitionRef.current = null;
        }
        setIsListening(false);
        setTranscript("");
        setError("");
        setIsClosing(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && !isClosing) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Set to false so it stops automatically after speech ends
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setError("");
      };

      recognition.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        // Update final transcript
        if (finalTranscript.trim()) {
          finalTranscriptRef.current = (finalTranscriptRef.current + " " + finalTranscript).trim();
        }
        setTranscript(finalTranscriptRef.current + interimTranscript);

        // Visual feedback for audio level (simplified)
        if (event.results.length > 0) {
          const confidence = event.results[event.results.length - 1][0].confidence || 0.5;
          setAudioLevel(confidence * 100);
        }

        // Clear any existing timeout
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
        }

        // If we have final results, process after a very short delay to catch any additional final results
        if (finalTranscript.trim() && isOpen) {
          speechTimeoutRef.current = setTimeout(() => {
            if (finalTranscriptRef.current && isOpen) {
              handleProcessTranscript(finalTranscriptRef.current);
            }
          }, 300); // Short delay to catch any additional final results
        } else if (interimTranscript && !finalTranscript.trim()) {
          // If we only have interim results, wait for silence (recognition will end automatically with continuous: false)
          speechTimeoutRef.current = setTimeout(() => {
            if (finalTranscriptRef.current && isOpen && !isListening) {
              handleProcessTranscript(finalTranscriptRef.current || transcript.trim());
            }
          }, 1000); // 1s delay for silence detection
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "no-speech" || event.error === "aborted") {
          // These are common and not necessarily errors
          return;
        }
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Process transcript immediately when speech ends
        if (isOpen && finalTranscriptRef.current) {
          handleProcessTranscript(finalTranscriptRef.current);
        } else if (isOpen && transcript.trim()) {
          // Fallback: use current transcript if finalTranscript is empty
          handleProcessTranscript(transcript.trim());
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isClosing]);

  // Start recognition when modal opens
  useEffect(() => {
    if (isOpen && recognitionRef.current && !isListening) {
      // Reset transcript when starting
      setTranscript("");
      finalTranscriptRef.current = "";
      setError("");
      
      // Small delay to allow animation to complete
      const timer = setTimeout(() => {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Ignore "already started" errors
          if (!e.message?.includes("already started")) {
            console.error("Error starting recognition:", e);
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isListening]);

  async function handleProcessTranscript(textToParse) {
    if (!textToParse || !textToParse.trim()) {
      setError("No speech detected");
      return;
    }

    setIsParsing(true);
    setError("");

    try {
      // Always use database search mode (parse-voice-food endpoint)
      const res = await fetch(`${API}/api/parse-voice-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToParse }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || 'Failed to parse voice input');
        setIsParsing(false);
        return;
      }

      const parsed = await res.json();
      
      // Database mode - pass parsed foods to handler (will search database)
      if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : parsed.name)) {
        onFoodParsed(parsed);
        setError("");
        setIsParsing(false);
        onClose();
      } else {
        setError("Could not extract food information from voice input");
        setIsParsing(false);
      }
    } catch (err) {
      console.error("Error parsing voice input:", err);
      setError("Failed to parse voice input");
      setIsParsing(false);
    }
  }

  // Calculate animation values
  const centerX = buttonPosition.x || window.innerWidth / 2;
  const centerY = buttonPosition.y || window.innerHeight / 2;
  const initialSize = Math.max(buttonPosition.width || 40, buttonPosition.height || 40);
  const screenDiagonal = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      id={modalIdRef.current}
      className={`fixed inset-0 z-50 flex items-center justify-center voice-modal-animation ${isClosing ? 'closing' : 'opening'}`}
      style={{
        backgroundColor: '#22c55e', // green-500
        '--initial-size': `${initialSize / 2}px`,
        '--final-size': `${screenDiagonal}px`,
        '--center-x': `${centerX}px`,
        '--center-y': `${centerY}px`,
        pointerEvents: (isOpen || isClosing) ? 'auto' : 'none', // Control pointer events
      }}
      onClick={onClose}
    >
      <style jsx>{`
        @keyframes expandCircle {
          from {
            clip-path: circle(var(--initial-size) at var(--center-x) var(--center-y));
            opacity: 0;
          }
          to {
            clip-path: circle(var(--final-size) at var(--center-x) var(--center-y));
            opacity: 1;
          }
        }

        @keyframes shrinkCircle {
          from {
            clip-path: circle(var(--final-size) at var(--center-x) var(--center-y));
            opacity: 1;
          }
          to {
            clip-path: circle(var(--initial-size) at var(--center-x) var(--center-y));
            opacity: 0;
          }
        }

        @keyframes ringPulse {
          0%, 100% {
            opacity: 0.15;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.25;
            transform: translate(-50%, -50%) scale(1.05);
          }
        }

        .voice-modal-animation.opening {
          animation: expandCircle 0.3s ease-out forwards;
        }

        .voice-modal-animation.closing {
          animation: shrinkCircle 0.3s ease-in forwards;
        }
      `}</style>

      <div className="flex flex-col items-center justify-center w-full h-full p-8" onClick={(e) => e.stopPropagation()}>
        {/* Microphone Icon with Visual Feedback */}
        <div className="relative flex items-center justify-center mb-6" style={{ width: '200px', height: '200px' }}>
          {/* Smooth animated rings */}
          {isListening && (
            <>
              {/* Outer ring - subtle pulse */}
              <div
                className="absolute rounded-full"
                style={{
                  width: '180px',
                  height: '180px',
                  border: '2px solid rgba(255, 255, 255, 0.15)',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  animation: 'ringPulse 2s ease-in-out infinite',
                }}
              />
              {/* Middle ring - responsive to audio */}
              <div
                className="absolute rounded-full"
                style={{
                  width: `${140 + audioLevel * 0.4}px`,
                  height: `${140 + audioLevel * 0.4}px`,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  transition: 'width 0.15s ease-out, height 0.15s ease-out, border-color 0.15s ease-out',
                  boxShadow: `0 0 ${20 + audioLevel * 0.2}px rgba(255, 255, 255, 0.2)`,
                }}
              />
              {/* Inner ring - closest to mic */}
              <div
                className="absolute rounded-full"
                style={{
                  width: `${100 + audioLevel * 0.3}px`,
                  height: `${100 + audioLevel * 0.3}px`,
                  border: '1.5px solid rgba(255, 255, 255, 0.5)',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  transition: 'width 0.1s ease-out, height 0.1s ease-out',
                  boxShadow: `0 0 ${15 + audioLevel * 0.15}px rgba(255, 255, 255, 0.3)`,
                }}
              />
            </>
          )}
          
          {/* Microphone Icon - Clickable to retry */}
          <button
            onClick={() => {
              if (error || (!isListening && !isParsing)) {
                setError("");
                setTranscript("");
                finalTranscriptRef.current = "";
                if (recognitionRef.current) {
                  try {
                    recognitionRef.current.start();
                  } catch (e) {
                    // Ignore errors
                  }
                }
              }
            }}
            className={`relative z-10 ${isListening ? 'text-white' : 'text-white/70'} hover:text-white transition-all duration-300 cursor-pointer`}
            style={{ 
              fontSize: '64px', 
              background: 'none', 
              border: 'none', 
              padding: 0,
              transform: isListening ? 'scale(1.05)' : 'scale(1)',
              filter: isListening ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))' : 'none',
            }}
            disabled={isListening || isParsing}
            aria-label="Start voice input or retry"
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-4">
          {isParsing ? (
            <p className="text-xl font-medium text-white tracking-wide" style={{ 
              letterSpacing: '0.5px',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              Processing...
            </p>
          ) : isListening ? (
            <p className="text-xl font-medium text-white tracking-wide" style={{ 
              letterSpacing: '0.5px',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              Listening...
            </p>
          ) : (
            <p className="text-xl font-medium text-white/90 tracking-wide" style={{ 
              letterSpacing: '0.5px',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              Click to start
            </p>
          )}
        </div>

        {/* Transcript */}
        {transcript && (
          <div className="text-center mb-4 max-w-md mx-auto px-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-4 border border-white/20" style={{
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
            }}>
              <p className="text-base text-white font-normal leading-relaxed" style={{
                letterSpacing: '0.3px',
                wordBreak: 'break-word'
              }}>
                {transcript}
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-center mb-4 max-w-md mx-auto px-4">
            <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-6 py-4 border border-red-400/30" style={{
              boxShadow: '0 4px 16px rgba(220, 38, 38, 0.2)'
            }}>
              <p className="text-sm font-medium text-white mb-2" style={{
                letterSpacing: '0.3px'
              }}>
                {error}
              </p>
              <p className="text-xs text-white/70 font-normal" style={{
                letterSpacing: '0.2px'
              }}>
                Click the microphone to try again
              </p>
            </div>
          </div>
        )}

        {/* Close Button - X icon */}
        <button
          onClick={onClose}
          className="mt-4 text-white/90 hover:text-white transition-colors"
          aria-label="Close"
          style={{ 
            background: 'rgba(255, 255, 255, 0.2)', 
            border: 'none', 
            borderRadius: '50%',
            padding: '8px',
            cursor: 'pointer',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

