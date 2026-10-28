package shop;

import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import org.junit.jupiter.api.Tag;

class OrderProperties {
    @Property
    @Tag("SHOP-2")
    boolean rejectsATaggedLine(@ForAll String rest) {
        return Parser.parse("smove " + rest).startsWith("smove");
    }
}
