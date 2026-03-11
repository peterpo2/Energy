import { useEffect, useMemo, useRef, useState } from "react";

const weekdayFormatter = new Intl.DateTimeFormat("bg-BG", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("bg-BG", { month: "long", year: "numeric" });
const displayFormatter = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface CalendarDay {
  key: string;
  dayNumber: number;
  isoDate: string;
  isCurrentMonth: boolean;
}

interface DateRangePickerProps {
  fromValue: string;
  toValue: string;
  onChange: (next: { fromValue: string; toValue: string }) => void;
}

function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(viewDate: Date): CalendarDay[] {
  const monthStart = startOfMonth(viewDate);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const isoDate = [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, "0"),
      String(current.getDate()).padStart(2, "0"),
    ].join("-");

    return {
      key: isoDate,
      dayNumber: current.getDate(),
      isoDate,
      isCurrentMonth: current.getMonth() === viewDate.getMonth(),
    };
  });
}

function sortRange(left: string, right: string): { fromValue: string; toValue: string } {
  return left <= right ? { fromValue: left, toValue: right } : { fromValue: right, toValue: left };
}

export function DateRangePicker(props: DateRangePickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => parseIsoDate(props.fromValue) ?? new Date());
  const [draftStart, setDraftStart] = useState(props.fromValue);
  const [draftEnd, setDraftEnd] = useState(props.toValue);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const weekdays = useMemo(() => {
    const monday = new Date(2026, 0, 5);
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(monday);
      current.setDate(monday.getDate() + index);
      return weekdayFormatter.format(current);
    });
  }, []);
  const nextMonth = useMemo(() => addMonths(viewDate, 1), [viewDate]);
  const firstMonthDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const secondMonthDays = useMemo(() => buildCalendarDays(nextMonth), [nextMonth]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraftStart(props.fromValue);
    setDraftEnd(props.toValue);
    setViewDate(parseIsoDate(props.fromValue) ?? parseIsoDate(props.toValue) ?? new Date());
  }, [isOpen, props.fromValue, props.toValue]);

  const rangeLabel =
    props.fromValue && props.toValue
      ? `${displayFormatter.format(parseIsoDate(props.fromValue) ?? new Date())} - ${displayFormatter.format(
          parseIsoDate(props.toValue) ?? new Date(),
        )}`
      : "Избери период";

  const previewFrom = draftStart;
  const previewTo = draftEnd || draftStart;

  const handleDayClick = (isoDate: string): void => {
    if (!draftStart || draftEnd) {
      setDraftStart(isoDate);
      setDraftEnd("");
      return;
    }

    const sorted = sortRange(draftStart, isoDate);
    setDraftStart(sorted.fromValue);
    setDraftEnd(sorted.toValue);
    props.onChange(sorted);
    setIsOpen(false);
  };

  return (
    <div className="date-range-picker" ref={rootRef}>
      <button
        type="button"
        className={`field-input field-input-strong date-picker-trigger${isOpen ? " date-picker-trigger-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          className={`date-picker-trigger-text${props.fromValue && props.toValue ? "" : " date-picker-trigger-placeholder"}`}
        >
          {rangeLabel}
        </span>
        <span className="date-picker-trigger-icon" aria-hidden="true">
          период
        </span>
      </button>

      {isOpen ? (
        <div className="date-range-picker-popover" role="dialog" aria-label="Избор на период">
          <div className="date-picker-header">
            <button
              type="button"
              className="btn btn-calendar-nav"
              onClick={() => setViewDate((current) => addMonths(current, -1))}
            >
              ‹
            </button>
            <div className="date-range-picker-summary">
              <span className="date-range-picker-summary-label">Период</span>
              <span className="date-range-picker-summary-value">{rangeLabel}</span>
            </div>
            <button
              type="button"
              className="btn btn-calendar-nav"
              onClick={() => setViewDate((current) => addMonths(current, 1))}
            >
              ›
            </button>
          </div>

          <div className="date-range-picker-months">
            {[{ monthDate: viewDate, days: firstMonthDays }, { monthDate: nextMonth, days: secondMonthDays }].map(
              ({ monthDate, days }) => (
                <div key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`} className="date-range-picker-month">
                  <div className="date-picker-title">{monthFormatter.format(monthDate)}</div>
                  <div className="date-picker-weekdays">
                    {weekdays.map((day) => (
                      <span key={`${monthDate.getMonth()}-${day}`} className="date-picker-weekday">
                        {day}
                      </span>
                    ))}
                  </div>
                  <div className="date-picker-grid">
                    {days.map((day) => {
                      const isSelectedStart = day.isoDate === previewFrom;
                      const isSelectedEnd = day.isoDate === previewTo;
                      const isInRange =
                        previewFrom && previewTo ? day.isoDate >= previewFrom && day.isoDate <= previewTo : false;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className={`date-picker-day${day.isCurrentMonth ? "" : " date-picker-day-muted"}${
                            isInRange ? " date-picker-day-in-range" : ""
                          }${isSelectedStart || isSelectedEnd ? " date-picker-day-selected" : ""}`}
                          onClick={() => handleDayClick(day.isoDate)}
                        >
                          {day.dayNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="date-range-picker-caption">
            {draftStart && !draftEnd ? "Избери крайна дата." : "Избери начало и край на периода от календара."}
          </div>

          <div className="date-picker-actions">
            <button
              type="button"
              className="btn btn-chip"
              onClick={() => {
                const today = new Date();
                const isoDate = [
                  today.getFullYear(),
                  String(today.getMonth() + 1).padStart(2, "0"),
                  String(today.getDate()).padStart(2, "0"),
                ].join("-");
                setDraftStart(isoDate);
                setDraftEnd(isoDate);
                props.onChange({ fromValue: isoDate, toValue: isoDate });
                setIsOpen(false);
              }}
            >
              Днес
            </button>
            <button type="button" className="btn btn-chip" onClick={() => setIsOpen(false)}>
              Затвори
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
