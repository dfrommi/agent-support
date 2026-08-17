package com.example.catalog;

/** Test-scope code that scope=main must exclude. */
public class CatalogServiceTest {
    private final CatalogService catalogService = new CatalogServiceImpl();

    public void exercise() {
        catalogService.createProduct("test");
    }
}
