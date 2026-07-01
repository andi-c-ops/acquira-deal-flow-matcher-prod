import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSummaryNotificationPreview } from "@/lib/dfm/providers/notification-client";

const sampleSummary = {
  generatedAt: "2026-05-14T13:42:00.000Z",
  fetchedDeals: 163,
  totalStrongMatches: 9,
  totalModerateMatches: 295,
  aesWithMatches: 35,
  aeReports: [
    {
      aeName: "Aaron Gilletti",
      strongMatches: 0,
      moderateMatches: 2,
      totalMatched: 2,
      matches: [
        {
          dealName: "Ad#:2506037 - Suffolk County CPA Practice For Sale",
          matchQuality: "Moderate",
          scorePct: 67,
          location: "Suffolk County",
          state: "New York",
          price: 1_400_000,
          ebitda: 0,
          listingUrl:
            "https://www.bizbuysell.com/business-opportunity/suffolk-county-cpa-practice-for-sale/2506037/",
        },
        {
          dealName: "Ad#:2505651 - Senior Medical Care Management & Fiduciary Services",
          matchQuality: "Moderate",
          scorePct: 67,
          location: "Peoria",
          state: "Arizona",
          price: 700_000,
          ebitda: 225_000,
          multiple: 3.1,
          listingUrl:
            "https://www.bizbuysell.com/business-opportunity/senior-medical-care-management-and-fiduciary-services/2505651/",
        },
      ],
    },
    {
      aeName: "Mike Duncan",
      strongMatches: 1,
      moderateMatches: 2,
      totalMatched: 3,
      matches: [
        {
          dealName: "Ad#:2505586 - Established Landscaping & Lawn Service Business for Sale",
          matchQuality: "Strong",
          scorePct: 83,
          location: "Fort Myers",
          state: "Florida",
          price: 185_000,
          ebitda: 108_000,
          multiple: 1.7,
          listingUrl:
            "https://www.bizbuysell.com/business-opportunity/established-landscaping-and-lawn-service-business-for-sale/2505586/",
        },
        {
          dealName: "Ad#:2505782 - Towing Company",
          matchQuality: "Moderate",
          scorePct: 67,
          location: "Palm Beach County",
          state: "Florida",
          price: 650_000,
          ebitda: 270_000,
          multiple: 2.4,
        },
        {
          dealName: "Ad#:2505778 - Kitchen and Bath Design and Renovation Company",
          matchQuality: "Moderate",
          scorePct: 67,
          location: "Palm Beach County",
          state: "Florida",
          price: 725_000,
          ebitda: 310_000,
          multiple: 2.3,
        },
      ],
    },
    {
      aeName: "Andi Test",
      strongMatches: 0,
      moderateMatches: 0,
      totalMatched: 0,
      matches: [],
    },
  ],
};

async function main() {
  const preview = buildSummaryNotificationPreview(sampleSummary);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputDir = path.resolve(__dirname, "../tmp-preview");
  const htmlPath = path.join(outputDir, "deal-flow-email-preview.html");
  const textPath = path.join(outputDir, "deal-flow-email-preview.txt");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(htmlPath, preview.html, "utf8");
  await fs.writeFile(textPath, `Subject: ${preview.subject}\n\n${preview.text}`, "utf8");

  console.log(`Subject: ${preview.subject}`);
  console.log(`HTML preview: ${htmlPath}`);
  console.log(`Text preview: ${textPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
