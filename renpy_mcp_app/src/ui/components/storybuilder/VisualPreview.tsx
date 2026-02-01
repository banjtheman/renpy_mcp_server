/**
 * VisualPreview - Full-Size Scene Preview
 *
 * Renders a full-size visual novel scene with background, characters, and dialogue.
 * Click on the dialogue box to advance through dialogue lines.
 */

import React, { useMemo } from 'react';
import type { LocalSceneState } from './visual-builder-types';

// ============================================================================
// Asset Types
// ============================================================================

interface CharacterAsset {
  name: string;
  emotions: Array<{ emotion: string; base64: string; mimeType: string }>;
}

interface BackgroundAsset {
  name: string;
  path: string;
  base64: string;
  mimeType: string;
}

// ============================================================================
// Component Props
// ============================================================================

interface VisualPreviewProps {
  scene: LocalSceneState;
  sceneLabel: string;
  dialogueIndex: number;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  onDialogueClick: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function VisualPreview({
  scene,
  sceneLabel,
  dialogueIndex,
  backgrounds,
  characters,
  onDialogueClick,
}: VisualPreviewProps) {
  // Find matching background asset
  const backgroundAsset = useMemo(() => {
    if (!scene.background) return null;

    // Try exact match first
    let match = backgrounds.find(
      (bg) => bg.name.toLowerCase() === scene.background!.toLowerCase()
    );

    // Try partial match (background name might be 'bg_cafe' but asset is 'cafe')
    if (!match) {
      const bgName = scene.background.replace(/^bg_?/i, '').toLowerCase();
      match = backgrounds.find(
        (bg) =>
          bg.name.toLowerCase().includes(bgName) || bgName.includes(bg.name.toLowerCase())
      );
    }

    return match;
  }, [scene.background, backgrounds]);

  // Find matching character assets with emotions
  const characterAssets = useMemo(() => {
    return scene.characters.map((char) => {
      const charAsset = characters.find(
        (c) => c.name.toLowerCase() === char.name.toLowerCase()
      );

      if (!charAsset) return { ...char, asset: null };

      // Find matching emotion or fall back to first available
      const emotionAsset =
        charAsset.emotions.find(
          (e) => e.emotion.toLowerCase() === (char.emotion || 'neutral').toLowerCase()
        ) || charAsset.emotions[0];

      return {
        ...char,
        asset: emotionAsset,
      };
    });
  }, [scene.characters, characters]);

  // Current dialogue line
  const currentDialogue = scene.dialogue[dialogueIndex] || null;
  const hasMoreDialogue = dialogueIndex < scene.dialogue.length - 1;

  const hasBackground = !!scene.background;
  const hasCharacters = scene.characters.length > 0;

  return (
    <div className="visual-preview">
      {/* Scene label */}
      <div className="visual-preview-label">{sceneLabel}</div>

      {/* Main viewport (16:9) */}
      <div className="visual-preview-viewport">
        {/* Background layer */}
        <div className={`visual-preview-bg ${hasBackground ? 'has-bg' : ''}`}>
          {backgroundAsset ? (
            <img
              src={`data:${backgroundAsset.mimeType};base64,${backgroundAsset.base64}`}
              alt={scene.background}
              className="visual-bg-image"
            />
          ) : hasBackground ? (
            <div className="bg-placeholder">
              <span className="bg-icon">{'\u{1F5BC}'}</span>
              <span className="bg-name">{scene.background}</span>
            </div>
          ) : (
            <div className="bg-empty">
              <span className="bg-icon">{'\u{1F3A8}'}</span>
              <span>No background set</span>
            </div>
          )}
        </div>

        {/* Characters layer */}
        {hasCharacters && (
          <div className="visual-preview-characters">
            {characterAssets.map((char, i) => (
              <div
                key={i}
                className={`visual-character visual-char-${char.position}`}
                title={`${char.name} (${char.emotion}) - ${char.position}`}
              >
                {char.asset ? (
                  <img
                    src={`data:${char.asset.mimeType};base64,${char.asset.base64}`}
                    alt={`${char.name} - ${char.emotion}`}
                    className="visual-char-image"
                  />
                ) : (
                  <div className="char-placeholder">
                    <span className="char-icon">{'\u{1F464}'}</span>
                    <span className="char-name">{char.name}</span>
                    <span className="char-emotion">({char.emotion})</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Dialogue box */}
        {currentDialogue && (
          <div
            className={`visual-dialogue-box ${hasMoreDialogue ? 'clickable' : ''}`}
            onClick={onDialogueClick}
          >
            {currentDialogue.speaker && (
              <div className="dialogue-speaker">{currentDialogue.speaker}</div>
            )}
            <p className="dialogue-text">{currentDialogue.text}</p>

            {/* Dialogue progress indicator */}
            <div className="dialogue-progress">
              {dialogueIndex + 1} / {scene.dialogue.length}
              {hasMoreDialogue && <span className="click-hint"> (click to advance)</span>}
            </div>
          </div>
        )}

        {/* No dialogue message */}
        {!currentDialogue && scene.dialogue.length === 0 && (
          <div className="visual-dialogue-box no-dialogue">
            <p className="dialogue-text empty">No dialogue in this scene</p>
          </div>
        )}

        {/* Choice overlay for menu scenes */}
        {scene.choices && scene.choices.length > 0 && dialogueIndex >= scene.dialogue.length - 1 && (
          <div className="visual-choices-overlay">
            {scene.choices.map((choice, i) => (
              <div key={i} className="visual-choice">
                <span className="choice-number">{i + 1}.</span>
                <span className="choice-text">{choice.text}</span>
                <span className="choice-target">→ {choice.target}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scene info footer */}
      <div className="visual-preview-footer">
        <span className="footer-stat">
          {'\u{1F4AC}'} {scene.dialogue.length} line{scene.dialogue.length !== 1 ? 's' : ''}
        </span>
        {scene.characters.length > 0 && (
          <span className="footer-stat">
            {'\u{1F464}'} {scene.characters.length} character
            {scene.characters.length !== 1 ? 's' : ''}
          </span>
        )}
        {scene.choices && scene.choices.length > 0 && (
          <span className="footer-stat">
            ? {scene.choices.length} choice{scene.choices.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

export default VisualPreview;
