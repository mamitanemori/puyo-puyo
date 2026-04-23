'use client';
import { useState, useEffect, useCallback } from 'react';

const KEY = 'puyo-highscore';

export function useHighScore() {
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) setHighScore(parseInt(saved, 10) || 0);
  }, []);

  const update = useCallback((score: number) => {
    setHighScore(prev => {
      if (score <= prev) return prev;
      localStorage.setItem(KEY, score.toString());
      return score;
    });
  }, []);

  return { highScore, update };
}
