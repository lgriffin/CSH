import { describe, expect, it } from "vitest";
import { parseTestResults, reduceTestResults } from "../src/index.ts";

const cite = /\b(?:[A-Z][A-Z0-9]*-[0-9]+)\b/g;
const brief = (text: string) => parseTestResults(text).results.map((r) => [r.file, r.name, r.outcome, r.at]);

// pytest --junitxml with junit_family=xunit1: each test case names its file and line.
const PYTEST_XUNIT1 = `<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" errors="1" failures="1" skipped="1" tests="5" time="0.05" timestamp="2026-10-01T10:00:00" hostname="ci">
<testcase classname="tests.test_auth" name="test_login_REQ_1" file="tests/test_auth.py" line="4" time="0.001"/>
<testcase classname="tests.test_auth.TestTokens" name="test_refresh[REQ-2]" file="tests/test_auth.py" line="12" time="0.002"><failure message="assert 1 == 2">def test_refresh():
&gt;       assert 1 == 2
E       assert 1 == 2</failure></testcase>
<testcase classname="tests.test_auth" name="test_logout" file="tests/test_auth.py" line="20" time="0.000"><skipped type="pytest.skip" message="not yet">tests/test_auth.py:20: not yet</skipped></testcase>
<testcase classname="tests.test_auth" name="test_db" file="tests/test_auth.py" line="25" time="0.000"><error message="failed on setup with &quot;fixture 'db' not found&quot;">...</error></testcase>
<testcase classname="tests.unit.test_x" name="test_xfail" file="tests/unit/test_x.py" line="3" time="0.000"><skipped type="pytest.xfail" message="known"/></testcase>
</testsuite></testsuites>
`;

// The same run with the default junit_family=xunit2: no file attribute, so the module is read from the classname.
const PYTEST_XUNIT2 = `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="0" failures="0" skipped="0" tests="3" time="0.03">
<testcase classname="tests.test_auth" name="test_login_REQ_1" time="0.001" />
<testcase classname="tests.test_auth.TestTokens" name="test_refresh[REQ-2]" time="0.002" />
<testcase classname="pkg.auth_test.TestNested.TestDeeper" name="test_ok" time="0.002" />
</testsuite></testsuites>`;

// Maven Surefire's TEST-*.xml: a testsuite root, dotted Java classnames, properties.
const SUREFIRE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd" version="3.0" name="com.example.billing.InvoiceTest" time="0.042" tests="3" errors="1" skipped="0" failures="1">
  <properties>
    <property name="java.version" value="21.0.2"/>
    <property name="os.name" value="Linux"/>
  </properties>
  <testcase name="totalsLines" classname="com.example.billing.InvoiceTest" time="0.004"/>
  <testcase name="BILL-7 rounds half up" classname="com.example.billing.InvoiceTest" time="0.012">
    <failure message="expected: &lt;10.05&gt; but was: &lt;10.04&gt;" type="org.opentest4j.AssertionFailedError"><![CDATA[org.opentest4j.AssertionFailedError: expected: <10.05> but was: <10.04>
	at com.example.billing.InvoiceTest.roundsHalfUp(InvoiceTest.java:31)]]></failure>
    <system-out><![CDATA[rounding 10.045]]></system-out>
  </testcase>
  <testcase name="loadsFixture" classname="com.example.billing.InvoiceTest" time="0.001">
    <error message="fixture.json" type="java.io.FileNotFoundException">java.io.FileNotFoundException: fixture.json</error>
  </testcase>
</testsuite>
`;

// Gradle's build/test-results/test/TEST-*.xml: a testsuite root, JUnit 5 method names, system-out and system-err.
const GRADLE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.CartTest" tests="2" skipped="1" failures="0" errors="0" timestamp="2026-10-01T10:00:00" hostname="ci" time="0.021">
  <properties/>
  <testcase name="addsItem() CART-3" classname="com.example.CartTest" time="0.019"/>
  <testcase name="removesItem()" classname="com.example.CartTest" time="0.0">
    <skipped/>
  </testcase>
  <system-out><![CDATA[Cart created
]]></system-out>
  <system-err><![CDATA[]]></system-err>
</testsuite>
`;

// cargo-nextest's junit.xml: a testsuites root, one testsuite per binary, the crate as classname.
const NEXTEST = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="nextest-run" tests="3" failures="1" errors="0" uuid="0b1c" timestamp="2026-10-01T10:00:00.000+00:00" time="0.120">
    <testsuite name="my-parser" tests="2" disabled="0" errors="0" failures="1">
        <testcase name="lexer::tests::reads_numbers" classname="my-parser" timestamp="2026-10-01T10:00:00.010+00:00" time="0.003">
        </testcase>
        <testcase name="parser::tests::rejects_empty_PRS_4" classname="my-parser" timestamp="2026-10-01T10:00:00.011+00:00" time="0.004">
            <failure type="test failure">thread 'parser::tests::rejects_empty_PRS_4' panicked at src/parser.rs:40:9</failure>
            <system-out></system-out>
            <system-err>thread panicked</system-err>
        </testcase>
    </testsuite>
    <testsuite name="my-parser::integration" tests="1" disabled="0" errors="0" failures="0">
        <testcase name="parses_file" classname="my-parser::integration" timestamp="2026-10-01T10:00:00.020+00:00" time="0.010">
        </testcase>
    </testsuite>
</testsuites>
`;

// go test -json ./... : a passing package with subtests, a package with no test files and a package that fails to build.
const GO = [
  `{"Time":"2026-10-01T10:00:00Z","Action":"start","Package":"example.com/shop/cart"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"run","Package":"example.com/shop/cart","Test":"TestAdd"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"output","Package":"example.com/shop/cart","Test":"TestAdd","Output":"=== RUN   TestAdd\\n"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"run","Package":"example.com/shop/cart","Test":"TestAdd/CART-1"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"output","Package":"example.com/shop/cart","Test":"TestAdd/CART-1","Output":"--- PASS: TestAdd/CART-1 (0.00s)\\n"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"pass","Package":"example.com/shop/cart","Test":"TestAdd/CART-1","Elapsed":0}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"run","Package":"example.com/shop/cart","Test":"TestAdd/full"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"fail","Package":"example.com/shop/cart","Test":"TestAdd/full","Elapsed":0}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"fail","Package":"example.com/shop/cart","Test":"TestAdd","Elapsed":0.01}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"skip","Package":"example.com/shop/cart","Test":"TestSlow","Elapsed":0}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"output","Package":"example.com/shop/cart","Output":"FAIL\\n"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"fail","Package":"example.com/shop/cart","Elapsed":0.02}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"start","Package":"example.com/shop/docs"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"output","Package":"example.com/shop/docs","Output":"?   \\texample.com/shop/docs\\t[no test files]\\n"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"skip","Package":"example.com/shop/docs","Elapsed":0}`,
  `{"ImportPath":"example.com/shop/pay [example.com/shop/pay.test]","Action":"build-output","Output":"# example.com/shop/pay\\n"}`,
  `{"ImportPath":"example.com/shop/pay [example.com/shop/pay.test]","Action":"build-fail"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"start","Package":"example.com/shop/pay"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"output","Package":"example.com/shop/pay","Output":"FAIL\\texample.com/shop/pay [build failed]\\n"}`,
  `{"Time":"2026-10-01T10:00:00Z","Action":"fail","Package":"example.com/shop/pay","Elapsed":0,"FailedBuild":"example.com/shop/pay [example.com/shop/pay.test]"}`,
  "",
].join("\n");

describe("JUnit XML (stage 30)", () => {
  it("reads pytest's xunit1 report by each test case's file, with its outcome and line", () => {
    const parsed = parseTestResults(PYTEST_XUNIT1);
    expect(parsed.problems).toEqual([]);
    expect(brief(PYTEST_XUNIT1)).toEqual([
      ["tests/test_auth.py", "tests.test_auth test_login_REQ_1", "passed", "3"],
      ["tests/test_auth.py", "tests.test_auth.TestTokens test_refresh[REQ-2]", "failed", "4"],
      ["tests/test_auth.py", "tests.test_auth test_logout", "skipped", "7"],
      ["tests/test_auth.py", "tests.test_auth test_db", "errored", "8"],
      ["tests/unit/test_x.py", "tests.unit.test_x test_xfail", "skipped", "9"],
    ]);
  });

  it("reads pytest's xunit2 report, with no file attribute, by the test module its classname names", () => {
    expect(parseTestResults(PYTEST_XUNIT2).problems).toEqual([]);
    expect(brief(PYTEST_XUNIT2).map(([file]) => file)).toEqual(["tests/test_auth.py", "tests/test_auth.py", "pkg/auth_test.py"]);
  });

  it("reads a test module from a classname whose last segment is one, in a suite not named pytest", () => {
    const xml = `<testsuite name="custom"><testcase classname="tests.test_b" name="test_c"/><testcase classname="tests.test_b.TestK" name="test_d"/></testsuite>`;
    expect(brief(xml).map(([file]) => file)).toEqual(["tests/test_b.py", "tests.test_b.TestK"]);
  });

  it("keeps a Surefire report's dotted classname as written, never guessing a file", () => {
    const parsed = parseTestResults(SUREFIRE);
    expect(parsed.problems).toEqual([]);
    expect(brief(SUREFIRE)).toEqual([
      ["com.example.billing.InvoiceTest", "com.example.billing.InvoiceTest totalsLines", "passed", "7"],
      ["com.example.billing.InvoiceTest", "com.example.billing.InvoiceTest BILL-7 rounds half up", "failed", "8"],
      ["com.example.billing.InvoiceTest", "com.example.billing.InvoiceTest loadsFixture", "errored", "13"],
    ]);
  });

  it("reads a Gradle report past its properties, system-out and system-err", () => {
    expect(parseTestResults(GRADLE).problems).toEqual([]);
    expect(brief(GRADLE)).toEqual([
      ["com.example.CartTest", "com.example.CartTest addsItem() CART-3", "passed", "4"],
      ["com.example.CartTest", "com.example.CartTest removesItem()", "skipped", "5"],
    ]);
  });

  it("reads cargo-nextest's report, one suite per test binary, by its crate", () => {
    expect(parseTestResults(NEXTEST).problems).toEqual([]);
    expect(brief(NEXTEST)).toEqual([
      ["my-parser", "my-parser lexer::tests::reads_numbers", "passed", "4"],
      ["my-parser", "my-parser parser::tests::rejects_empty_PRS_4", "failed", "6"],
      ["my-parser::integration", "my-parser::integration parses_file", "passed", "13"],
    ]);
  });

  it("reads test cases in nested suites, and a suite's file attribute", () => {
    const xml = `<!-- a comment -->\n<testsuites>\n<testsuite name="outer" file="spec/a_spec.rb">\n<testsuite name="inner">\n<testcase name="works"/>\n</testsuite>\n<testcase classname="Outer" name="also" file="spec/b_spec.rb"/>\n</testsuite>\n</testsuites>`;
    expect(brief(xml)).toEqual([
      ["spec/a_spec.rb", "works", "passed", "5"],
      ["spec/b_spec.rb", "Outer also", "passed", "7"],
    ]);
  });

  it("reports malformed XML and a test case with no name with their lines", () => {
    expect(parseTestResults(`<?xml version="1.0"?>\n<testsuite name="x">\n<testcase name="a">\n</testsuite>`)).toEqual({ results: [], problems: [{ line: 4, message: "end tag testsuite does not close testcase" }] });
    expect(parseTestResults(`<testsuites>\n<testsuite>\n<testcase classname="a"/>`).problems).toEqual([{ line: 3, message: "unclosed element testsuite" }]);
    const unnamed = parseTestResults(`<testsuite>\n<testcase classname="a"/>\n<testcase name="b"/>\n</testsuite>`);
    expect(unnamed.problems).toEqual([{ line: 2, message: "a testcase has no name" }]);
    expect(unnamed.results.map((r) => r.name)).toEqual(["b"]);
  });

  it("leaves a document whose root is not a test suite to the other readers", () => {
    expect(parseTestResults(`<project><testsuite/></project>`).problems[0]!.message).toMatch(/^not JSON/);
  });
});

describe("go test -json (stage 30)", () => {
  it("reads each test's pass, fail or skip by package and full name, and a package that failed to build as errored", () => {
    const parsed = parseTestResults(GO);
    expect(parsed.problems).toEqual([]);
    expect(brief(GO)).toEqual([
      ["example.com/shop/cart", "TestAdd/CART-1", "passed", "6"],
      ["example.com/shop/cart", "TestAdd/full", "failed", "8"],
      ["example.com/shop/cart", "TestAdd", "failed", "9"],
      ["example.com/shop/cart", "TestSlow", "skipped", "10"],
      ["example.com/shop/pay", "", "errored", "20"],
    ]);
  });

  it("reports a package that failed with no test failing in it as errored", () => {
    const text = `{"Action":"pass","Package":"p","Test":"TestA"}\n{"Action":"output","Package":"p","Output":"exit status 1\\n"}\n{"Action":"fail","Package":"p"}\n`;
    expect(brief(text)).toEqual([
      ["p", "TestA", "passed", "1"],
      ["p", "", "errored", "3"],
    ]);
  });

  it("reports a line that is not JSON, or not an event, with its line", () => {
    const text = `{"Action":"run","Package":"p","Test":"TestA"}\n# p\n{"Action":"pass","Package":"p","Test":"TestA"}\n[1]\n`;
    const parsed = parseTestResults(text);
    expect(parsed.results.map((r) => r.name)).toEqual(["TestA"]);
    expect(parsed.problems.map((p) => p.line)).toEqual([2, 4]);
    expect(parsed.problems[0]!.message).toMatch(/^not JSON/);
    expect(parsed.problems[1]!.message).toBe("not a go test -json event with an Action");
  });

  it("reads the events after a first line that is not JSON, and reports that line (F124)", () => {
    const text = `go: downloading github.com/lib/pq v1.10.9\n{"Action":"pass","Package":"p","Test":"TestA"}\n`;
    const parsed = parseTestResults(text);
    expect(brief(text)).toEqual([["p", "TestA", "passed", "2"]]);
    expect(parsed.problems.map((p) => p.line)).toEqual([1]);
    expect(parsed.problems[0]!.message).toMatch(/^not JSON/);
  });

  it("leaves execution lines and JSON reports to their readers", () => {
    expect(brief(`{"schema":"csh-execution/v1","test":"a.ts::R-1 x","outcome":"passed"}\n`)).toEqual([["a.ts", "R-1 x", "passed", "1"]]);
    expect(brief(JSON.stringify({ testResults: [{ name: "a.ts", assertionResults: [{ fullName: "x", status: "passed" }] }] }))).toEqual([["a.ts", "x", "passed", "testResults[0].assertionResults[0]"]]);
  });
});

describe("reducing JUnit and go test -json reports (stage 30)", () => {
  it("reduces a JUnit report to files, counts and cited identifiers, with no test name", () => {
    const { reduced, problems } = reduceTestResults(PYTEST_XUNIT1, { cite, commit: "c1" });
    expect(problems).toEqual([]);
    expect(reduced).toEqual({
      schema: "csh-results/v1",
      commit: "c1",
      files: [
        { file: "tests/test_auth.py", passed: 1, failed: 0, errored: 1, skipped: 1, cited: [{ outcome: "failed", cites: ["REQ-2"] }] },
        { file: "tests/unit/test_x.py", passed: 0, failed: 0, errored: 0, skipped: 1, cited: [] },
      ],
    });
    expect(JSON.stringify(reduced)).not.toContain("test_logout");
    const surefire = reduceTestResults(SUREFIRE, { cite }).reduced.files;
    expect(surefire).toEqual([{ file: "com.example.billing.InvoiceTest", passed: 1, failed: 0, errored: 1, skipped: 0, cited: [{ outcome: "failed", cites: ["BILL-7"] }] }]);
  });

  it("reduces go test -json by package, cutting a module path given as the base", () => {
    const { reduced, problems } = reduceTestResults(GO, { cite, base: "example.com/shop" });
    expect(problems).toEqual([]);
    expect(reduced.files).toEqual([
      { file: "cart", passed: 0, failed: 2, errored: 0, skipped: 1, cited: [{ outcome: "passed", cites: ["CART-1"] }] },
      { file: "pay", passed: 0, failed: 0, errored: 1, skipped: 0, cited: [] },
    ]);
  });

  it("cites nothing where a runner joins an identifier to a word, as Go's subtest names and pytest's function names do", () => {
    const text = `{"Action":"pass","Package":"p","Test":"TestAdd/CART-1_empty_cart"}\n{"Action":"pass","Package":"p","Test":"TestAdd/CART-2"}\n`;
    expect(reduceTestResults(text, { cite }).reduced.files).toEqual([{ file: "p", passed: 1, failed: 0, errored: 0, skipped: 0, cited: [{ outcome: "passed", cites: ["CART-2"] }] }]);
  });
});
