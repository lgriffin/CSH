#[test]
fn ui() {
    let t = trybuild::TestCases::new();
    t.compile_fail("tests/ui/missing_field.rs");
    t.pass("tests/ui/compiles.rs");
}
