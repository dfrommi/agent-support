package com.example;

public class UserRepository {
    public User findById(String id) {
        return new User(id, "default");
    }

    public void save(User user) {
        // persist
    }
}
