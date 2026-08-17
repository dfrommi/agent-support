package com.example.catalog;

import org.springframework.stereotype.Service;

@Service
public class CatalogServiceImpl implements CatalogService {
    @Override
    public String createProduct(String key) {
        return "created:" + key;
    }

    @Override
    public String updateProduct(String key) {
        return "updated:" + key;
    }

    @Override
    public String deleteProduct(String key) {
        return "deleted:" + key;
    }
}
