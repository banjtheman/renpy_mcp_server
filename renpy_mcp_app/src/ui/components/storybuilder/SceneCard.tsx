/**
 * SceneCard - Mini Scene Preview Card
 *
 * Displays a compact preview of a scene for the storyboard view.
 * Shows background, characters, and first dialogue line.
 */

import React, { useMemo } from 'react';
import type { SceneNodeData } from '../../../lib/story-types';

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

interface SceneCardProps {
  scene: SceneNodeData;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  isSelected?: boolean;
  onClick: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function SceneCard({
  scene,
  backgrounds,
  characters,
  isSelected = false,
  onClick,
}: SceneCardProps) {
  // Find matching background asset
  const backgroundAsset = useMemo(() => {
    if (!scene.background) return null;

    // Try exact match first
    let match = backgrounds.find(
      (bg) => bg.name.toLowerCase() === scene.background!.toLowerCase()
    );

    // Try partial match
    if (!match) {
      const bgName = scene.background.replace(/^bg_?/i, '').toLowerCase();
      match = backgrounds.find(
        (bg) =>
          bg.name.toLowerCase().includes(bgName) || bgName.includes(bg.name.toLowerCase())
      );
    }

    return match;
  }, [scene.background, backgrounds]);

  // Find first character's asset for preview
  const firstCharAsset = useMemo(() => {
    if (scene.characters.length === 0) return null;

    const firstChar = scene.characters[0];
    const charAsset = characters.find(
      (c) => c.name.toLowerCase() === firstChar.name.toLowerCase()
    );

    if (!charAsset) return null;

    const emotionAsset =
      charAsset.emotions.find(
        (e) => e.emotion.toLowerCase() === (firstChar.emotion || 'neutral').toLowerCase()
      ) || charAsset.emotions[0];

    return emotionAsset;
  }, [scene.characters, characters]);

  // Format label for display
  const displayLabel = scene.label
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  const firstDialogue = scene.dialogue[0];
  const isMenuNode = scene.choices && scene.choices.length > 0;

  return (
    <div
      className={`scene-card ${isSelected ? 'selected' : ''} ${isMenuNode ? 'menu-node' : ''}`}
      onClick={onClick}
    >
      {/* Mini viewport */}
      <div className="scene-card-viewport">
        {/* Background */}
        {backgroundAsset ? (
          <img
            src={`data:${backgroundAsset.mimeType};base64,${backgroundAsset.base64}`}
            alt=""
            className="scene-card-bg"
          />
        ) : (
          <div className="scene-card-bg-placeholder" />
        )}

        {/* Character silhouette */}
        {firstCharAsset && (
          <img
            src={`data:${firstCharAsset.mimeType};base64,${firstCharAsset.base64}`}
            alt=""
            className="scene-card-character"
          />
        )}

        {/* Dialogue preview */}
        {firstDialogue && (
          <div className="scene-card-dialogue">
            <span className="dialogue-preview">
              {firstDialogue.speaker && <strong>{firstDialogue.speaker}: </strong>}
              {firstDialogue.text.slice(0, 50)}
              {firstDialogue.text.length > 50 ? '...' : ''}
            </span>
          </div>
        )}

        {/* Choice indicator */}
        {isMenuNode && (
          <div className="scene-card-choice-badge">
            {scene.choices!.length} choices
          </div>
        )}
      </div>

      {/* Label */}
      <div className="scene-card-label">
        <span className="label-text">{displayLabel}</span>
        <span className="label-stats">
          {scene.dialogue.length} lines
          {scene.characters.length > 0 && ` · ${scene.characters.length} chars`}
        </span>
      </div>
    </div>
  );
}

export default SceneCard;
