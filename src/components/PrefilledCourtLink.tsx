"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function isYmd(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHm(value: string | null): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

type Props = {
  courtId: string;
  day?: string | null;
  time?: string | null;
  hasDayParam: boolean;
  hasTimeParam: boolean;
  className?: string;
  children: React.ReactNode;
};

export function PrefilledCourtLink(props: Props) {
  const [resolvedDay, setResolvedDay] = useState(props.day ?? null);
  const [resolvedTime, setResolvedTime] = useState(props.time ?? null);

  useEffect(() => {
    if (props.hasDayParam && props.hasTimeParam) return;

    let lastHref: string | null = null;
    try {
      lastHref = window.localStorage.getItem("ph:lastSearchHref");
    } catch {
      return;
    }
    if (!lastHref) return;

    let url: URL;
    try {
      url = new URL(lastHref, window.location.origin);
    } catch {
      return;
    }

    const day = url.searchParams.get("day");
    const time = url.searchParams.get("time");
    const nextDay = !props.hasDayParam && isYmd(day) ? day : null;
    const nextTime = !props.hasTimeParam && isHm(time) ? time : null;

    if (!nextDay && !nextTime) return;

    setResolvedDay((current) => nextDay ?? current);
    setResolvedTime((current) => nextTime ?? current);
  }, [props.hasDayParam, props.hasTimeParam]);

  const href = useMemo(() => {
    const params = new URLSearchParams();
    if (resolvedDay) params.set("day", resolvedDay);
    if (resolvedTime) params.set("time", resolvedTime);
    const qs = params.toString();
    return qs ? `/courts/${props.courtId}?${qs}` : `/courts/${props.courtId}`;
  }, [props.courtId, resolvedDay, resolvedTime]);

  return (
    <Link href={href} className={props.className}>
      {props.children}
    </Link>
  );
}
