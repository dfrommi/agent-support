package com.example.catalog;

/** Product information service (interface). */
public interface CatalogService {
    String createProduct(String key);

    String updateProduct(String key);

    String deleteProduct(String key);
}
