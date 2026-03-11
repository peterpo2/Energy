import { NormalizedHeadersResult } from "./normalizeHeaders";

export interface SolarmanColumnMap {
  plantName?: number;
  updatedTime?: number;
  timeZone?: number;
  productionPower?: number;
  consumptionPower?: number;
  gridPower?: number;
  purchasingPower?: number;
  feedInPower?: number;
}

export interface SolarmanMappingResult {
  columnMap: SolarmanColumnMap;
  recognizedColumns: string[];
  unknownColumns: string[];
}

type ColumnKey = keyof SolarmanColumnMap;

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  plantName: ["plantname", "plant", "stationname"],
  updatedTime: ["updatedtime", "updatetime", "time", "timestamp", "datetime"],
  timeZone: ["timezone", "tz", "timezones"],
  productionPower: ["productionpowerw", "productionpower", "pvpowerw", "pvoutputpowerw"],
  consumptionPower: ["consumptionpowerw", "consumptionpower", "loadpowerw", "loadpower"],
  gridPower: ["gridpowerw", "gridpower", "utilitypowerw"],
  purchasingPower: ["purchasingpowerw", "purchasingpower", "purchasepowerw", "importpowerw"],
  feedInPower: ["feedinpowerw", "feedinpower", "feed-inpowerw", "exportpowerw"],
};

export function mapSolarmanColumns(
  normalizedHeaders: NormalizedHeadersResult,
): SolarmanMappingResult {
  const columnMap: SolarmanColumnMap = {};
  const recognizedColumns = new Set<string>();

  (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach((key) => {
    for (const alias of COLUMN_ALIASES[key]) {
      const header = normalizedHeaders.byNormalizedName[alias];
      if (header) {
        columnMap[key] = header.index;
        recognizedColumns.add(header.original);
        break;
      }
    }
  });

  const unknownColumns = normalizedHeaders.headers
    .filter((h) => h.original && !recognizedColumns.has(h.original))
    .map((h) => h.original);

  return {
    columnMap,
    recognizedColumns: Array.from(recognizedColumns),
    unknownColumns,
  };
}

