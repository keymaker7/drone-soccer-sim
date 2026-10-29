import { describe, expect, it } from 'vitest';
import { createPractice, practiceStep } from './practice';

const setup = () => {
  const s = createPractice(), ring = s.rings.red;
  const touch = {x:ring.x,y:ring.y + .1,z:0}, away = {...touch,x:ring.x - .6};
  return {s,touch,away};
};
describe('practice rim contact grouping at 120 Hz', () => {
  it('counts scraping with repeated brief gaps as one contact', () => {
    const {s,touch,away} = setup();
    for (let n=0;n<19;n++) {
      practiceStep(s,away,touch);
      for (let step=0;step<12;step++) practiceStep(s,touch,touch);
      for (let step=0;step<10;step++) practiceStep(s,away,away);
    }
    expect(s.rimTouches).toBe(1);
  });
  it('counts a second contact after 0.6 seconds away', () => {
    const {s,touch,away} = setup();
    practiceStep(s,away,touch);
    for (let step=0;step<72;step++) practiceStep(s,away,away);
    practiceStep(s,away,touch);
    expect(s.rimTouches).toBe(2);
  });
  it.each([[59,1],[60,2]])('requires 60 uninterrupted clear steps: %s steps -> %s contacts', (steps,count) => {
    const {s,touch,away} = setup();
    practiceStep(s,away,touch);
    for(let i=0;i<steps;i++) practiceStep(s,away,away);
    practiceStep(s,away,touch);
    expect(s.rimTouches).toBe(count);
  });
});
