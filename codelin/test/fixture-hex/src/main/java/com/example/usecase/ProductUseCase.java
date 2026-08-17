package com.example.usecase;

import com.example.service.ProductService;

public class ProductUseCase {
    private final ProductService service;

    public ProductUseCase(ProductService service) {
        this.service = service;
    }

    public String add(String key) {
        return service.add(key);
    }
}
