import { APP_PRODUCT_NAME } from "@shared";

export const mainBgText = {
  dialogs: {
    startupErrorTitle: `Грешка при стартиране на ${APP_PRODUCT_NAME}`,
    uncaughtExceptionTitle: `Неприхванато изключение в ${APP_PRODUCT_NAME}`,
    unhandledRejectionTitle: `Неприхваната грешка в ${APP_PRODUCT_NAME}`,
    openExcelTitle: "Избор на Excel файл",
    saveExportTitle: "Запазване на експорт",
    importCancelled: "Изборът на файл беше отказан.",
    exportCancelled: "Запазването на експорт беше отказано.",
  },
  ipc: {
    aggregationCompleted: "Агрегацията е изчислена успешно.",
    nightCompleted: "Нощният анализ е изчислен успешно.",
    exportCompleted: "Експортът е завършен успешно.",
    importCompleted: "Импортът е завършен успешно.",
  },
  errors: {
    datasetNotFound: "Избраният набор не беше намерен.",
    datasetHasNoMeasurements: "Избраният набор няма валидни измервания за анализ.",
    noNightAnalysisAvailable: "Няма наличен нощен анализ за експорт.",
    importCancelled: "Импортът беше прекъснат.",
    invalidTimeRange: "Началната дата не може да е след крайната.",
  },
  importProgress: {
    selectingFile: "Избор на файл за импорт",
    starting: "Стартиране на импорта",
    persisting: "Записване на данните в локалната база",
    completed: "Импортът е приключил",
    cancelled: "Импортът е прекъснат",
    failed: "Импортът завърши с грешка",
  },
  log: {
    secondInstanceFocused: "Втора инстанция беше блокирана; фокусиран е съществуващият прозорец.",
    runtimeSmokeStarted: "Стартиран е packaged runtime smoke тест.",
    runtimeSmokeFinished: "Packaged runtime smoke тестът приключи.",
  },
} as const;

export function formatMissingIntervalWarning(
  startIsoUtc: string,
  endIsoUtc: string,
  missingPoints: number,
): string {
  return `Липсващ интервал: ${startIsoUtc} -> ${endIsoUtc} (${missingPoints})`;
}
