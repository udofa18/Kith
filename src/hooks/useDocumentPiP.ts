import { useState, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DocumentPiPOptions {
  pipWindow: Window | null;
  onExit?: () => void;
}

export function useDocumentPiP({ pipWindow, onExit }: DocumentPiPOptions) {
  const [isActive, setIsActive] = useState(false);
  const isSupported = 'documentPictureInPicture' in window;

  useEffect(() => {
    setIsActive(!!pipWindow);
  }, [pipWindow]);

  const PiPPortal = useCallback(({ children }: { children: ReactNode }) => {
    if (isActive && pipWindow) {
      return createPortal(children, pipWindow.document.body);
    }
    return null;
  }, [isActive, pipWindow]);

  return {
    isSupported,
    isActive,
    PiPPortal
  };
}
