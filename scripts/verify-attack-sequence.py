"""以本機 Chromium 比對 dev/build 的實際招池；不呼叫外部 AI 服務。"""

import argparse
import json

from playwright.sync_api import sync_playwright


PATTERNS = {
    "paper_rain", "comment_crossfire", "deadline_beam", "closing_walls",
    "revision_homing", "returnable_burst", "top_downpour", "pulse_barrage",
    "alternating_zipper",
}
AI_BOSS = {
    "schemaVersion": 1,
    "seed": 270027,
    "bossName": "洗牌測試獸",
    "openingLine": "所有招式都準備好了。",
    "weakPointLabel": "測試",
    "theme": "office",
    "attacks": [
        {"pattern": "revision_homing", "intensity": 3, "durationMs": 9000},
        {"pattern": "closing_walls", "intensity": 1, "durationMs": 4500},
        {"pattern": "pulse_barrage", "intensity": 2, "durationMs": 7600},
    ],
    "battleLines": [f"這是第 {index} 句測試台詞。" for index in range(1, 13)],
    "resultLine": "九招測試完成。",
}


def inspect_battle(browser, url, source, mobile=False, query="", seed=270027):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
        is_mobile=mobile,
        has_touch=mobile,
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    boss = {**AI_BOSS, "seed": seed}
    page.route("**/api/boss", lambda route: route.abort() if source == "fallback" else route.fulfill(
        content_type="application/json", body=json.dumps({"source": "ai", "boss": boss}),
    ))
    page.goto(f"{url}/?{query}")
    # 僅在此瀏覽器測試記住 Phaser 實例；不新增正式版 debug/test hook。
    page.evaluate("""() => {
        const Game = window.Phaser.Game;
        window.Phaser.Game = class extends Game {
            constructor(...args) { super(...args); window.__attackQA = this; }
        };
    }""")
    page.get_by_test_id("generate-boss").click()
    page.get_by_test_id("skip-camera").click()
    page.wait_for_function("window.__attackQA?.scene.getScene('BattleScene')?.session.state === 'DODGING'")
    result = page.evaluate("""() => {
        const scene = window.__attackQA.scene.getScene('BattleScene');
        scene.scene.pause();
        const director = scene.director;
        const patterns = [director.currentPattern];
        for (let index = 1; index < 27; index++) {
            director.pause();
            director.resume(true);
            patterns.push(director.currentPattern);
        }
        return {patterns, pool: director.dna.attacks, devHook: Boolean(window.__NOXCAT_TEST__)};
    }""")
    assert not errors, errors
    for offset in range(0, 27, 9):
        assert set(result["patterns"][offset:offset + 9]) == PATTERNS, result
        if offset:
            assert result["patterns"][offset] != result["patterns"][offset - 1], result
    assert result["patterns"][:9] != result["patterns"][9:18], result
    if source == "ai":
        assert all(step in result["pool"] for step in boss["attacks"]), result
    context.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev-url", default="http://127.0.0.1:4173")
    parser.add_argument("--production-url", default="http://127.0.0.1:4175")
    args = parser.parse_args()
    results = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for mode, url in [("development", args.dev_url), ("production", args.production_url)]:
            for source in ["fallback", "ai"]:
                for mobile in [False, True]:
                    result = inspect_battle(browser, url, source, mobile)
                    key = f"{mode}/{source}/{'mobile' if mobile else 'desktop'}"
                    results[key] = result
                    assert result["devHook"] == (mode == "development"), result
                    print(json.dumps({"case": key, "rounds": 3, "patterns": result["patterns"]}), flush=True)
        baseline = results["production/fallback/desktop"]["patterns"]
        assert all(result["patterns"] == baseline for result in results.values())
        for query in ["demo=all", "demo=off"]:
            result = inspect_battle(browser, args.production_url, "fallback", query=query)
            assert result["patterns"] == baseline, result
        different_seed = inspect_battle(browser, args.production_url, "ai", seed=123456)
        assert different_seed["patterns"] != baseline
        browser.close()
    print("PASS: dev/build, AI/fallback, desktop/mobile, seed replay, and production query overrides")


if __name__ == "__main__":
    main()
