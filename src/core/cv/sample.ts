import { createEmptyCv, schemaUsesExperienceSkills, schemaUsesProjectPso } from "./schema";
import type { CvContent } from "./types";

/** Deterministic sample used by renderer checks and tests. Contains an XSS probe. */
export function sampleCv(schemaId: string): CvContent {
  const cv = createEmptyCv(schemaId, {
    name: "Alex Example",
    headline: "Computer Vision Engineer",
    contact: ["alex@example.com", "+1 555 0100", "github.com/example", "Berlin, Germany"],
  });
  cv.sectionTitles = {
    summary: "Profile",
    education: "Education",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    custom: "Additional",
  };
  if (schemaId !== "classic") {
    cv.summary =
      "Computer vision engineer who ships real-time perception systems for constrained hardware.";
  }
  cv.education = [
    { degree: "BSc Artificial Intelligence", school: "Example University", meta: "GPA: 3.8\nBerlin, Germany\n2026" },
  ];
  cv.skills = [
    { label: "Programming", items: ["Python", "C++", "TypeScript"] },
    { label: "ML", items: ["PyTorch", "TensorRT", "OpenCV"] },
  ];
  cv.experience = [
    {
      role: "Machine Learning Intern",
      dates: "June 2025 – August 2025",
      org: "Example Labs – Berlin, Germany",
      blurb: "Perception team for autonomous systems.",
      bullets: [
        "Built a real-time detector reaching 25 FPS on edge hardware.",
        "Improved recall by 12% on an internal benchmark.",
      ],
      ...(schemaUsesExperienceSkills(schemaId) ? { skills: ["PyTorch", "TensorRT", "Python"] } : {}),
    },
    {
      role: "Software Engineer",
      dates: "August 2024 – June 2025",
      org: "Example Aerospace – Munich, Germany",
      bullets: ["Developed vision-based targeting and precision landing software."],
      ...(schemaUsesExperienceSkills(schemaId) ? { skills: ["C++", "ROS2", "OpenCV"] } : {}),
    },
  ];
  cv.projects = [
    schemaUsesProjectPso(schemaId)
      ? {
          role: "GPS-Denied Localisation",
          dates: "2026",
          org: "Final Year Project",
          problem: "Drones lose navigation when GPS is unavailable.",
          solution: "Matched aerial imagery against georeferenced tiles with learned features.",
          outcome: "Estimated position within 8 metres during live flight tests.",
        }
      : {
          role: "GPS-Denied Localisation",
          dates: "2026",
          org: "Final Year Project",
          bullets: ["Built a vision-based localisation pipeline with learned feature matching."],
        },
  ];
  cv.custom = [];
  cv.basics.name = "Alex <script>alert(1)</script> Example";
  return cv;
}
