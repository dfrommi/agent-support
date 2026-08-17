package com.example.service;

import com.example.port.out.ProductPersistencePort;

public class ProductService {
    private final ProductPersistencePort port;

    public ProductService(ProductPersistencePort port) {
        this.port = port;
    }

    public String add(String key) {
        return addProduct(key);
    }

    public String addProduct(String key) {
        return port.addProduct(key);
    }
}
