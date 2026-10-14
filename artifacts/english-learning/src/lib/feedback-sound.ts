export function playAnswerFeedbackSound(correct: boolean): Promise<void> {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return Promise.resolve();
  }

  try {
    const context = new window.AudioContext();
    const notes = correct ? [660, 880] : [240, 180];
    const noteDuration = 0.12;

    void context.resume().catch(() => undefined);
    notes.forEach((frequency, index) => {
      const startAt = context.currentTime + index * noteDuration;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = correct ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      volume.gain.setValueAtTime(0.0001, startAt);
      volume.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, startAt + noteDuration);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + noteDuration);
    });

    return new Promise((resolve) => {
      window.setTimeout(() => {
        void context.close().catch(() => undefined).finally(resolve);
      }, notes.length * noteDuration * 1000 + 80);
    });
  } catch {
    return Promise.resolve();
  }
}
