import type { ArtifactProfile, PopulationCompatibility, ProfileDifference } from "./types";

function schemaDifferences(current: ArtifactProfile, candidate: ArtifactProfile): ProfileDifference[] {
  const differences: ProfileDifference[] = [];

  if (current.entries.length !== candidate.entries.length) {
    differences.push({
      path: "entries.length",
      current: String(current.entries.length),
      candidate: String(candidate.entries.length),
    });
  }

  const count = Math.min(current.entries.length, candidate.entries.length);
  for (let index = 0; index < count; index += 1) {
    const left = current.entries[index];
    const right = candidate.entries[index];
    const values: Array<[string, unknown, unknown]> = [
      ["encoding", left.encoding, right.encoding],
      ["delimiter", left.delimiter, right.delimiter],
      ["headers", left.headers, right.headers],
    ];

    for (const [field, currentValue, candidateValue] of values) {
      const currentText = JSON.stringify(currentValue);
      const candidateText = JSON.stringify(candidateValue);

      if (currentText !== candidateText) {
        differences.push({
          path: `entries[${index}].${field}`,
          current: currentText,
          candidate: candidateText,
        });
      }
    }
  }

  return differences;
}

export function compareProfiles(
  current: ArtifactProfile,
  previousYear: ArtifactProfile,
  previousMonth: ArtifactProfile,
): PopulationCompatibility {
  const previousYearDifferences = schemaDifferences(current, previousYear);
  if (previousYearDifferences.length === 0) {
    return {
      comparisonMode: "same_month_previous_year",
      comparisonPeriod: previousYear.period,
      compatible: true,
      fallbackReason: null,
      differences: [],
    };
  }

  const previousMonthDifferences = schemaDifferences(current, previousMonth);
  if (previousMonthDifferences.length === 0) {
    return {
      comparisonMode: "previous_month",
      comparisonPeriod: previousMonth.period,
      compatible: true,
      fallbackReason: "previous_year_schema_mismatch",
      differences: previousYearDifferences,
    };
  }

  return {
    comparisonMode: "unavailable",
    comparisonPeriod: null,
    compatible: false,
    fallbackReason: "previous_month_schema_mismatch",
    differences: [...previousYearDifferences, ...previousMonthDifferences],
  };
}
