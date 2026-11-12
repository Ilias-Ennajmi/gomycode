// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { BOARD_READY_MARK, markBoardReady } from "@/lib/board/ready";

beforeEach(() => performance.clearMarks(BOARD_READY_MARK));

const marks = () => performance.getEntriesByName(BOARD_READY_MARK);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("markBoardReady", () => {
  it("is named atelier:board-ready", () => {
    expect(BOARD_READY_MARK).toBe("atelier:board-ready");
  });

  it("an empty board is ready after the first frame", async () => {
    markBoardReady(document.createElement("div"), false);
    expect(marks()).toHaveLength(0);
    await wait(80);
    expect(marks()).toHaveLength(1);
  });

  it("a board with objects is ready once the first object is in the page", async () => {
    const root = document.createElement("div");
    markBoardReady(root, true);
    await wait(60);
    expect(marks()).toHaveLength(0);
    const o = document.createElement("div");
    o.setAttribute("data-object-id", "a");
    root.append(o);
    await wait(80);
    expect(marks()).toHaveLength(1);
  });

  it("gives up waiting after the timeout and still marks, flagged", async () => {
    markBoardReady(document.createElement("div"), true, { timeoutMs: 40 });
    await wait(150);
    expect(marks()).toHaveLength(1);
    expect((marks()[0] as PerformanceMark).detail).toMatchObject({ timedOut: true });
  });

  it("cancelling stops it", async () => {
    const stop = markBoardReady(document.createElement("div"), false);
    stop();
    await wait(80);
    expect(marks()).toHaveLength(0);
  });
});
