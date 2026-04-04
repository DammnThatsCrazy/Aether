export function createReplayController(events, onEvent) {
    let currentIndex = 0;
    let timer = null;
    let speed = 1;
    let isPlaying = false;
    function play() {
        if (isPlaying || currentIndex >= events.length)
            return;
        isPlaying = true;
        scheduleNext();
    }
    function pause() {
        isPlaying = false;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }
    function stop() {
        pause();
        currentIndex = 0;
    }
    function seek(index) {
        currentIndex = Math.max(0, Math.min(index, events.length - 1));
    }
    function setSpeed(s) {
        speed = s;
    }
    function scheduleNext() {
        if (!isPlaying || currentIndex >= events.length) {
            isPlaying = false;
            return;
        }
        const event = events[currentIndex];
        if (!event)
            return;
        onEvent(event);
        currentIndex++;
        if (currentIndex < events.length) {
            const nextEvent = events[currentIndex];
            if (nextEvent) {
                const delay = Math.max(50, (new Date(nextEvent.timestamp).getTime() - new Date(event.timestamp).getTime()) / speed);
                timer = setTimeout(scheduleNext, delay);
            }
        }
        else {
            isPlaying = false;
        }
    }
    return { play, pause, stop, seek, setSpeed, getState: () => ({ isPlaying, currentIndex, speed }) };
}
