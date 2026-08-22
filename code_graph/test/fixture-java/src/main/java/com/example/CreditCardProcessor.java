package com.example;

public class CreditCardProcessor implements PaymentProcessor {
    public String process(String payment) {
        return "charged " + payment;
    }
}
