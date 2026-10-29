#!/usr/bin/env node
/**
 * Offline stand-in for career-ops' `browser-extract.mjs`, used only by
 * `npm run smoke`. It ignores its arguments and prints one canned extractor
 * result, so the job-fetch route and the Target-stage happy path can be
 * exercised without a network, a real board, or a career-ops checkout.
 *
 * Contract mirrored here: stdout is a single JSON object
 * `{ url, title, text, ats }`, exit 0 on success.
 */
const target = {
  url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
  title: "Computer Vision Engineer",
  text: [
    "Acme Robotics is hiring a computer vision engineer to own perception for our warehouse fleet.",
    "",
    "Responsibilities: build and ship real-time detectors, own the evaluation pipeline, and work with the controls team on deployment.",
    "Requirements: strong Python and C++, hands-on PyTorch, experience with edge inference, and a track record of measurable improvements.",
    "Nice to have: ROS 2, camera calibration, and experience with low-power hardware.",
  ].join("\n"),
  ats: "ashby",
};

process.stdout.write(JSON.stringify(target));
