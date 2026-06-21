/**
 * Time Utilities Module
 * Shows the page owner's local time (in their configured timezone) and how
 * many hours the *viewer* is ahead of / behind the owner.
 */

function getZoneOffsetMinutes(timeZone, date = new Date()) {
    // Offset (in minutes) from UTC for the given IANA timezone at `date`.
    try {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const parts = {};
        for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
        // Build a UTC timestamp from the wall-clock time reported for that zone.
        const asUTC = Date.UTC(
            +parts.year, +parts.month - 1, +parts.day,
            +parts.hour % 24, +parts.minute, +parts.second
        );
        return Math.round((asUTC - date.getTime()) / 60000);
    } catch (e) {
        return null;
    }
}

function formatOffsetDelta(minutes) {
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    if (h === 0 && m === 0) return '0h';
    if (m === 0) return `${h}h`;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
}

function describeViewerDiff(ownerTimeZone) {
    const now = new Date();
    const ownerOffset = getZoneOffsetMinutes(ownerTimeZone, now);
    if (ownerOffset === null) return '';

    const viewerOffset = -now.getTimezoneOffset(); // minutes ahead of UTC
    const diff = viewerOffset - ownerOffset;        // viewer relative to owner

    if (diff === 0) return "You're in the same timezone";
    return diff > 0
        ? `You're ${formatOffsetDelta(diff)} ahead of me`
        : `You're ${formatOffsetDelta(diff)} behind me`;
}

function initTimeDisplay(config) {
    const timeElement = document.getElementById('current-time');
    const tzDiffElement = document.getElementById('tz-diff');
    const ownerTimeZone =
        (config && config.profile && config.profile.timezone) ||
        Intl.DateTimeFormat().resolvedOptions().timeZone;

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: ownerTimeZone,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    function updateTime() {
        if (timeElement) {
            try {
                timeElement.textContent = timeFormatter.format(new Date());
            } catch (e) {
                timeElement.textContent = new Date().toTimeString().split(' ')[0];
            }
        }
    }

    if (tzDiffElement) {
        tzDiffElement.textContent = describeViewerDiff(ownerTimeZone);
    }

    updateTime();
    setInterval(updateTime, 1000);
    // Refresh the viewer-diff occasionally in case of DST boundaries / long sessions.
    setInterval(() => {
        if (tzDiffElement) tzDiffElement.textContent = describeViewerDiff(ownerTimeZone);
    }, 60000);
}

window.TimeUtils = { initTimeDisplay };
