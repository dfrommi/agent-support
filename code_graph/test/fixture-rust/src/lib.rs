pub struct User {
    pub id: String,
    pub name: String,
}

impl User {
    pub fn new(id: String, name: String) -> Self {
        Self { id, name }
    }

    pub fn greet(&self) -> String {
        format_message(self.name.clone())
    }
}

pub fn format_message(name: String) -> String {
    let greeting = build_greeting();
    format!("{}, {}!", greeting, name)
}

fn build_greeting() -> String {
    "Hello".to_string()
}

pub struct UserRepository {
    users: Vec<User>,
}

impl UserRepository {
    pub fn new() -> Self {
        Self { users: Vec::new() }
    }

    pub fn find_by_id(&self, id: &str) -> Option<&User> {
        validate_id(id);
        self.users.iter().find(|u| u.id == id)
    }

    pub fn save(&mut self, user: User) {
        self.users.push(user);
    }
}

fn validate_id(id: &str) {
    if id.is_empty() {
        panic!("id must not be empty");
    }
}

pub trait Auditable {
    fn audit_log(&self, message: &str);
}

pub struct AuditLogger;

impl Auditable for AuditLogger {
    fn audit_log(&self, message: &str) {
        log_message(message);
    }
}

fn log_message(msg: &str) {
    println!("[AUDIT] {}", msg);
}
