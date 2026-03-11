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

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
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

export function DatePicker(props: DatePickerProps): JSX.Element {
  const selectedDate = parseIsoDate(props.value);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const weekdays = useMemo(() => {
    const monday = new Date(2026, 0, 5);
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(monday);
      current.setDate(monday.getDate() + index);
      return weekdayFormatter.format(current);
    });
  }, []);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

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

    setViewDate(selectedDate ?? new Date());
  }, [isOpen, selectedDate]);

  const label = selectedDate ? displayFormatter.format(selectedDate) : props.placeholder ?? "--/--/----";

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        type="button"
        className={`field-input field-input-strong date-picker-trigger${isOpen ? " date-picker-trigger-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={`date-picker-trigger-text${selectedDate ? "" : " date-picker-trigger-placeholder"}`}>
          {label}
        </span>
        <span className="date-picker-trigger-icon" aria-hidden="true">
          календар
        </span>
      </button>

      {isOpen ? (
        <div className="date-picker-popover" role="dialog" aria-label="Избор на дата">
          <div className="date-picker-header">
            <button
              type="button"
              className="btn btn-calendar-nav"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            >
              {bgPrev}
            </button>
            <div className="date-picker-title">{monthFormatter.format(viewDate)}</div>
            <button
              type="button"
              className="btn btn-calendar-nav"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            >
              {bgNext}
            </button>
          </div>

          <div className="date-picker-weekdays">
            {weekdays.map((day) => (
              <span key={day} className="date-picker-weekday">
                {day}
              </span>
            ))}
          </div>

          <div className="date-picker-grid">
            {calendarDays.map((day) => {
              const isSelected = day.isoDate === props.value;
              return (
                <button
                  key={day.key}
                  type="button"
                  className={`date-picker-day${day.isCurrentMonth ? "" : " date-picker-day-muted"}${
                    isSelected ? " date-picker-day-selected" : ""
                  }`}
                  onClick={() => {
                    props.onChange(day.isoDate);
                    setIsOpen(false);
                  }}
                >
                  {day.dayNumber}
                </button>
              );
            })}
          </div>

          <div className="date-picker-actions">
            <button
              type="button"
              className="btn btn-chip"
              onClick={() => {
                const now = new Date();
                const isoDate = [
                  now.getFullYear(),
                  String(now.getMonth() + 1).padStart(2, "0"),
                  String(now.getDate()).padStart(2, "0"),
                ].join("-");
                props.onChange(isoDate);
                setViewDate(now);
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

const bgPrev = "‹";
const bgNext = "›";
