package com.example.controller;

import com.example.usecase.ProductUseCase;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProductController {
    private final ProductUseCase useCase;

    public ProductController(ProductUseCase useCase) {
        this.useCase = useCase;
    }

    @PostMapping("/partner/v2/products")
    public String create(String key) {
        return useCase.add(key);
    }
}
