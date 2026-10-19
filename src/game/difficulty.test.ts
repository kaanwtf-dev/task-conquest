import { describe, expect, it } from 'vitest';
import { guessDifficulty } from './difficulty';

describe('automatic difficulty', () => {
  it('guesses from the words in the name', () => {
    expect(guessDifficulty('Drink water')).toBe(0);
    expect(guessDifficulty('Call mom')).toBe(1);
    expect(guessDifficulty('Clean the kitchen')).toBe(2);
    expect(guessDifficulty('Workout at the gym')).toBe(3);
    expect(guessDifficulty('Do my taxes')).toBe(4);
    expect(guessDifficulty('Something')).toBe(2);
  });
  it('matches whole words only, and the hardest wins', () => {
    expect(guessDifficulty('Brainstorm')).toBe(2); // not "run"/"train"
    expect(guessDifficulty('Email the thesis draft')).toBe(4);
  });
  it("prefers the player's own earlier choice", () => {
    expect(guessDifficulty('Workout', { workout: 1 })).toBe(1);
  });
});
