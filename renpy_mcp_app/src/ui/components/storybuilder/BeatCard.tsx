/**
 * BeatCard - Individual Story Beat Card
 *
 * Displays a single moment in the story (dialogue, narration, or choice).
 * Shows the current background and characters at that moment.
 */

import React, { useMemo } from 'react';
import type { StoryBeat } from './visual-builder-types';

// ============================================================================
// Asset Types
// ============================================================================

interface CharacterAsset {
  name: string;
  emotions: Array<{ emotion: string; base64: string; base64Transparent: string; mimeType: string }>;
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

interface BeatCardProps {
  beat: StoryBeat;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  isSelected?: boolean;
  onClick: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BeatCard({
  beat,
  backgrounds,
  characters,
  isSelected = false,
  onClick,
}: BeatCardProps) {
  // Find matching background - normalize underscores/hyphens for matching
  const backgroundAsset = useMemo(() => {
    if (!beat.background) return null;

    // Normalize: remove bg_ prefix, convert underscores to hyphens, lowercase
    const normalize = (s: string) =>
      s.replace(/^bg_?/i, '').replace(/_/g, '-').toLowerCase();

    const beatBgNorm = normalize(beat.background);

    // Try exact match first (after normalization)
    let match = backgrounds.find((bg) => normalize(bg.name) === beatBgNorm);

    // Try partial match
    if (!match) {
      match = backgrounds.find((bg) => {
        const bgNorm = normalize(bg.name);
        return bgNorm.includes(beatBgNorm) || beatBgNorm.includes(bgNorm);
      });
    }

    return match;
  }, [beat.background, backgrounds]);

  // Find character assets (up to 3 characters)
  const characterAssets = useMemo(() => {
    return beat.characters.slice(0, 3).map((char) => {
      const charAsset = characters.find(
        (c) => c.name.toLowerCase() === char.name.toLowerCase()
      );
      if (!charAsset) return null;

      const emotionAsset =
        charAsset.emotions.find(
          (e) => e.emotion.toLowerCase() === (char.emotion || 'neutral').toLowerCase()
        ) || charAsset.emotions[0];

      return emotionAsset;
    }).filter(Boolean);
  }, [beat.characters, characters]);

  // Card type styling
  const cardClass = [
    'beat-card',
    `beat-card-${beat.type}`,
    isSelected ? 'selected' : '',
    beat.isLabelStart ? 'label-start' : '',
    beat.choiceBranch ? 'choice-branch' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} onClick={onClick}>
      {/* Mini preview */}
      <div className="beat-card-preview">
        {/* Background */}
        {backgroundAsset ? (
          <img
            src={`data:${backgroundAsset.mimeType};base64,${backgroundAsset.base64}`}
            alt=""
            className="beat-bg"
          />
        ) : (
          <div className="beat-bg-placeholder" />
        )}

        {/* Characters (small) */}
        {characterAssets.length > 0 && (
          <div className="beat-characters">
            {characterAssets.map((asset, i) => (
              asset && (
                <img
                  key={i}
                  src={`data:${asset.mimeType};base64,${asset.base64Transparent || asset.base64}`}
                  alt=""
                  className="beat-char"
                />
              )
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="beat-card-content">
        {beat.type === 'choice' ? (
          // Choice beat
          <div className="beat-choices">
            <span className="choice-label">Choose:</span>
            {beat.choices?.slice(0, 3).map((choice, i) => (
              <span key={i} className="choice-option">{choice.text}</span>
            ))}
            {beat.choices && beat.choices.length > 3 && (
              <span className="choice-more">+{beat.choices.length - 3} more</span>
            )}
          </div>
        ) : beat.type === 'label-start' && beat.dialogueIndex === -1 ? (
          // Empty label marker
          <div className="beat-label-marker">
            <span className="label-name">{beat.text}</span>
          </div>
        ) : (
          // Dialogue or narration
          <div className="beat-dialogue">
            {beat.speaker && (
              <span className="beat-speaker">{beat.speaker}</span>
            )}
            <span className={`beat-text ${!beat.speaker ? 'narration' : ''}`}>
              {beat.text.length > 80 ? beat.text.slice(0, 80) + '...' : beat.text}
            </span>
          </div>
        )}
      </div>

      {/* Label indicator for first beat of a label */}
      {beat.isLabelStart && beat.dialogueIndex >= 0 && (
        <div className="beat-label-tag">
          {beat.sourceLabel.replace(/_/g, ' ')}
        </div>
      )}

      {/* Choice branch indicator */}
      {beat.choiceBranch && (
        <div className="beat-branch-tag">
          &#10095; {beat.choiceBranch.length > 20 ? beat.choiceBranch.slice(0, 20) + '...' : beat.choiceBranch}
        </div>
      )}
    </div>
  );
}

export default BeatCard;
