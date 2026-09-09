import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("explains that neighborhood change data is being prepared", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("동네 변화 데이터를 준비하고 있습니다.");
    expect(markup).toContain("동네로그");
    expect(markup).toContain("숫자로 보는 우리 동네의 변화");
    expect(markup).toContain("동네 검색");
    expect(markup).toContain('action="/search"');
    expect(markup).toContain("max-w-[48rem]");
    expect(markup).toContain("max-w-[36rem]");
  });
});
