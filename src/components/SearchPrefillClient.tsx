"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isYmd(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHm(value: string | null): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

export function SearchPrefillClient(props: {
  hasDayParam: boolean;
  hasTimeParam: boolean;
  basePath: string;
}) {
  const router = useRouter();

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

    const params = new URLSearchParams(window.location.search);
    if (nextDay) params.set("day", nextDay);
    if (nextTime) params.set("time", nextTime);

    const qs = params.toString();
    router.replace(qs ? `${props.basePath}?${qs}` : props.basePath);
  }, [props.basePath, props.hasDayParam, props.hasTimeParam, router]);

  return null;
}
