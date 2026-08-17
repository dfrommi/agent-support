package com.example.persistence;

import com.example.catalog.CatalogService;

public class CatalogPersistenceImpl implements CatalogPersistence {
    private final CatalogService catalogService;

    public CatalogPersistenceImpl(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @Override
    public String addCatalogProduct(String key) {
        return catalogService.createProduct(key);
    }
}
