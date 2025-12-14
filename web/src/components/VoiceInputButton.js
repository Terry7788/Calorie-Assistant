"use client";

import { useState, useRef } from "react";
import { Button } from "@nextui-org/react";
import VoiceInputModal from "./VoiceInputModal";

export default function VoiceInputButton({ onFoodParsed, disabled }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const buttonRef = useRef(null);
  const justClosedRef = useRef(false);

  const handleClick = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    
    // Prevent opening if modal is already open or if we just closed (debounce)
    if (isModalOpen || justClosedRef.current) {
      return;
    }
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      });
    }
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    // Set debounce to prevent accidental immediate reopening
    justClosedRef.current = true;
    // Reset the flag after a shorter delay
    setTimeout(() => {
      justClosedRef.current = false;
    }, 200); // Reduced to 200ms - just enough to prevent double-clicks
  };

  const handleFoodParsed = (foods) => {
    onFoodParsed?.(foods);
    handleClose();
  };

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        className="btn btn-soft"
        size="sm"
        onClick={handleClick}
        disabled={disabled || isModalOpen} // Disable button when modal is open
        aria-label="Start voice input"
        isIconOnly
        style={{ minWidth: '40px', width: '40px', height: '40px', zIndex: 10 }} // Added zIndex
      >
        <svg
          width="20"
          height="20"
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
      </Button>
      <VoiceInputModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onFoodParsed={handleFoodParsed}
        buttonPosition={buttonPosition}
      />
    </>
  );
}

