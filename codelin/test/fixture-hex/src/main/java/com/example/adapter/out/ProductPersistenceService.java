package com.example.adapter.out;

import com.example.port.out.ProductPersistencePort;
import com.example.persistence.CatalogPersistence;

public class ProductPersistenceService implements ProductPersistencePort {
    private final CatalogPersistence persistence;

    public ProductPersistenceService(CatalogPersistence persistence) {
        this.persistence = persistence;
    }

    @Override
    public String addProduct(String key) {
        return persistence.addCatalogProduct(key);
    }
}
