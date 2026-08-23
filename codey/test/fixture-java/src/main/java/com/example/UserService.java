package com.example;

public class UserService {
    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    public User findUser(String id) {
        validateId(id);
        return repository.findById(id);
    }

    public void createUser(User user) {
        validateUser(user);
        repository.save(user);
        auditLog("User created: " + user.getName());
    }

    private void validateId(String id) {
        if (id == null || id.isEmpty()) {
            throw new IllegalArgumentException("id must not be empty");
        }
    }

    private void validateUser(User user) {
        if (user == null) {
            throw new IllegalArgumentException("user must not be null");
        }
    }

    @Deprecated
    private void auditLog(String message) {
        // logging
    }
}
