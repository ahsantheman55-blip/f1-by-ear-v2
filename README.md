# F1 by Ear 2

An accessible Formula One audio racing game for iPhone Safari, made for Ahsan Ali. Version 2: a spoken race engineer who calls every corner, an 8-speed gearbox you can hear, and 100 tracks in 10 championships. Version 1 is unchanged at https://ahsantheman55-blip.github.io/f1-by-ear/

Play: https://ahsantheman55-blip.github.io/f1-by-ear-v2/

- Race engineer (speechSynthesis): corner calls timed from your speed and braking distance so they finish before the braking point ("Right hairpin in 250, heavy braking", "Brake now!", "Turn right"). Priority queue: corner calls first, safety calls (wide, off track, crash) next; chatter is dropped when the voice is busy. One utterance at a time, strong references, stall watchdog, unlocked on the first tap.
- Commentary levels: corners only, corners and positions, full (overtakes, gaps, lap times, fastest lap, rival mistakes, defending, slipstream, gears).
- Gearbox: 8 gears, real rpm (4,200 to 12,500), upshift ignition cut and crackle, downshift blips and pops, rev limiter. Engine pitch is rpm / 20 Hz (V6 firing frequency).
- 100 tracks: 94 built from a written spec (name, length, corners, character, difficulty) and a fixed seed, plus 6 hand-laid "-style" tracks (Monza, Silverstone, Spa, Monaco, Suzuka, Interlagos). 10 championships of 10, points 25-18-15-12-10-8-6-4, standings saved; top three unlocks the next championship.
- Steering, pedals, calibration, automatic speed and the practice lesson carried over from version 1.
- Plain HTML and JavaScript, no libraries, works offline after the first visit.
## Sound credits
All from Freesound. CC0 unless marked. Engine loops were cut, levelled and pitch-steadied.
- "F1 BR 06 Engine Starts" by rfhache, https://freesound.org/s/44771/ (CC BY 4.0) - own engine, low revs
- "RedLine" by egomassive, https://freesound.org/s/536754/ (CC0) - own engine, high revs
- "F1practice3MelbGP2012DR066" by Ears68, https://freesound.org/s/150337/ (CC0) - rival engines
- "rumble strip exit 41" by bsumusictech, https://freesound.org/s/62652/ (CC0) - kerbs
- "Tires on Gravel Road 1" by OBXJohn, https://freesound.org/s/251661/ (CC0) - gravel
- "screeching tyres / tires" by johnnydekk, https://freesound.org/s/614627/ (CC0) - tyre squeal
- "Car Crash" by squareal, https://freesound.org/s/237375/ (CC0) - barrier
- "Clank Car Crash Collision" by qubodup, https://freesound.org/s/151624/ (CC0) - car contact
- "Pre start Crowd F1 race 2022 Autodromo Jose Carlos Pace" by Anzeladac, https://freesound.org/s/704960/ (CC BY 4.0) - grandstands
- "RoaringCrowd" by benfree, https://freesound.org/s/130568/ (CC0) - finish cheer
- "F1 Podium Champagne Air Horns" by WebbFilmsUK, https://freesound.org/s/200812/ (CC BY 4.0) - finish horns
CC BY 4.0: https://creativecommons.org/licenses/by/4.0/

Gear crackles, pops, wind, the engine's synthesised layer and all tones are made by the game. Tracks and drivers are fictional.

Built by Work Mate, November 2026.
