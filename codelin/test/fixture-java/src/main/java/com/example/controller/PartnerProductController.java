package com.example.controller;

import com.example.catalog.CatalogService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PartnerProductController {
    private final CatalogService catalogService;

    public PartnerProductController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @PostMapping("/partner/v2/products")
    public String createProduct(String key) {
        return catalogService.createProduct(key);
    }

    @PostMapping("/partner/v2/products/update")
    public String updateProduct(String key) {
        return catalogService.updateProduct(key);
    }
}
