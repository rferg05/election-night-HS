# Election Night

Home Screens module: a full-screen board of live results for the 3 November 2026 midterms, made to read from across the room. It's added at 1920 × 1080 with square corners, to fill the screen; it scales to any size, and switches to a stacked layout on a portrait screen.

## What it shows

The layout follows the Election Night 2026 board it's modelled on (dark theme, same panels and colors), made to be watched rather than clicked: anything that board let you click through now turns over on its own.

- **Header.** A Live chip with when the count was last updated (amber if civicAPI isn't answering, with the time of the count shown) and a clock.
- **Senate and House panels.** Each party's gains (seats won from the other party, in called races) with the net change and how many more flips look likely, a seat bar with the majority mark, seats won with "+n ahead" in uncalled races, what each party still needs, and each party's expected seats. The Senate counts the 65 seats not up this year (34 Dem caucus, counting King and Sanders, and 31 GOP); the vice president breaks a 50–50 tie for the GOP.
- **Map.** The real state outlines, with the small Northeast states as boxes beside the Atlantic. The Senate map shows holds, flips (hatched) and, fainter, races this module thinks are likely but aren't called, with the share counted under each state. The House map shows flips by state ("+2D"). It switches between the two (or shows one).
- **Next poll closing.** A countdown to the next closing and the Senate races in it.
- **Race desk.** Every Senate race, then the House seats worth watching (the template board's 91-seat watch list, anything civicAPI rates a toss-up or lean, and any seat changing hands), a page at a time. Races being counted come first, closest first; then the latest calls; then those still waiting, by poll closing. Each row has the candidates, vote shares with a bar, the share counted, the pre-election rating, and either the call (D HOLD, R GAIN) or this module's read (Likely D, 96% to win; Too close).
- **Live feed.** The last 30 minutes, newest first, a page at a time: race calls as this module sees them (every Senate race and the watched House seats), Senate lead changes, poll closings, and election headlines from AP, CBS News, The New York Times, PBS and NPR. Items from the last 3 minutes are highlighted.
- **Democratic wins.** When a race is called for a Democrat, blue fireworks and confetti play over the module with a banner naming the seat (and "Democratic pickup" if it's a flip): 10 seconds for a Senate seat or a pickup, 7 for anything else. Wins called in the same update share one celebration ("5 Democratic wins"). Calls already made the first time the module ever runs don't set it off, and a celebration more than 3 minutes old is skipped. It can be turned off in the settings.
- **Chicago Board of Education.** The board president's race and the 20 district seats (1A to 10B): each seat's leader and vote share, gold once called.

## Who's likely to win

A race is **Called** only when the source calls it. Everything else is this module's own estimate, and the footer says so:

1. Estimate the uncounted vote from the share reported, plus 2% for late and provisional ballots.
2. Work out what share of the uncounted vote the runner-up needs to catch up.
3. Estimate the runner-up's likely share of the rest. Early on it leans on civicAPI's pre-election forecast, since the first batches can be lopsided (mail-in vs. election-day). As the count goes on it leans on the count instead. The uncertainty narrows as more is counted.
4. That gives the leader's chance: 99.5%+ is **Projected**, 95%+ **Likely**, 75%+ **Leaning**, and anything lower **Too close**. Under 10% counted nothing goes past Leaning, and under 50% nothing goes past Likely.

The model is deliberately simple. It doesn't know which counties are still out, so treat it as a guide, not a call.

## Where it comes from

[civicAPI](https://civicapi.org): free, no key. Results update about every 15 seconds; the module checks every 60 by default.

- `GET /api/v2/race/87528`: every Senate race, by state.
- `GET /api/v2/race/87524`: every House race, by district.
- `GET /api/v2/forecast/{senate|house}/2026/civicapi`: the pre-election ratings and win chances used before votes come in.
- Chicago school board: found with `/api/v2/race/search`, then each race by its ID. The school board refreshes half as often as the federal races.

- Headlines: the politics feeds of CBS News, The New York Times, PBS and NPR, and AP's stories by way of Google News, every 2 minutes. Only election stories are kept.
- Seat holders and ratings when civicAPI's forecast can't be had: the template board's tables (Senate: Cook Political Report; House watch list: PollingSource, plus four Inside Elections additions).
- Map outlines: us-atlas 3.0.1, Albers USA.

civicAPI doesn't say when a race was called, so a call's time in the feed and on the race desk is when this module first saw it. Calls already made the first time the module ever runs aren't put in the feed.

civicAPI was overloaded on election night, with stretches of 502 errors and minute-long answers. The module keeps what it last had: each chamber shows as soon as it's in, the forecast is kept once had, and the last count is saved in the browser, so after a restart the board shows it at once (the header says so) until a new one comes in.

civicAPI's search was overloaded on election day and often timed out. The module retries every 10 minutes, and the federal results don't wait on it. If it never finds the school board, look up the race IDs on civicapi.org (the number at the end of a race's link) and paste them into **School board race IDs**.

## Settings

| Setting | Default | |
|---|---|---|
| Map shows | Senate and House in turn | Or just one. |
| Switch map every | 20 s | 5 to 300 seconds. |
| Turn the race list and feed every | 10 s | 4 to 60 seconds. |
| Check for new results every | 60 s | 30 to 600 seconds. |
| Election headlines in the live feed | on | |
| Live feed shows the last | 30 min | 5 to 240 minutes. |
| Celebrate Democratic wins | on | |
| Chicago Board of Education | on | |
| School board race IDs | empty | civicAPI race IDs, comma-separated, if the search can't find them. |

## Install

In the Home Screens editor, open the Plugin Store, choose **Install from URL**, and paste the URL of `release/election-night.tar.gz` once it's attached to a GitHub release.

## Developing

```bash
npm install
npm run preview   # http://localhost:5182 against live civicAPI and the news feeds
npm test
npm run build     # dist/bundle.js
```

Preview options:

- `?sim=40` fills every race with a made-up count about 40% in, so you can check the layout and likelihoods before real votes arrive.
- `?board=fake` shows stand-in school board races.
- `?map=house`, `?w=1080&h=1920` and similar change the map view and module size.
- The **Celebrate 1** and **Celebrate 5** buttons play the Democratic-win celebration.

To package: copy `manifest.json` and `dist/bundle.js(.map)` into `release/pkg/election-night/`, then run
`tar -czf release/election-night-<version>.tar.gz -C release/pkg election-night`. Copy the result to `release/election-night.tar.gz` and attach both to a GitHub release tagged `v<version>`.
