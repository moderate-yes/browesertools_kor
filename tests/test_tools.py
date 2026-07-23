import unittest
from decimal import Decimal
from unittest.mock import patch

from app.tools import (
    InputError,
    calculate_currency,
    calculate_margin,
    automatic_conversion,
    clean_list,
    count_text,
    convert_currency,
    convert_number_units,
    convert_unit,
    english_number_to_korean,
    korean_number_to_english,
    number_to_korean_amount,
)


class ToolTests(unittest.TestCase):
    def test_english_number_to_korean(self):
        self.assertEqual(english_number_to_korean("1 billion"), {"number": "1,000,000,000", "korean": "10억"})
        self.assertEqual(english_number_to_korean("3.5 million")["korean"], "350만")
        self.assertEqual(english_number_to_korean("$1.2 bn")["korean"], "12억")
        self.assertEqual(english_number_to_korean("원 빌리언")["korean"], "10억")
        self.assertEqual(english_number_to_korean("1빌리언")["korean"], "10억")

    def test_english_number_rejects_unknown_unit(self):
        with self.assertRaises(InputError):
            english_number_to_korean("2 gazillion")

    def test_korean_number_to_english(self):
        self.assertEqual(korean_number_to_english("10억")["english"], "1 billion")
        self.assertEqual(korean_number_to_english("2조 3천억")["english"], "2.3 trillion")
        result = convert_number_units({"direction": "korean_to_english", "value": "350만"})
        self.assertEqual(result["primary"], "3.5 million")

    def test_number_conversion_detects_direction_automatically(self):
        self.assertEqual(convert_number_units({"value": "1빌리언"})["primary"], "10억")
        self.assertEqual(convert_number_units({"value": "10억"})["primary"], "1 billion")
        bare = convert_number_units({"value": "100000000"})
        self.assertEqual(bare["primary"], "1억")
        self.assertEqual(bare["secondary"], "100 million")

    def test_number_to_korean_amount(self):
        result = number_to_korean_amount("125000000")
        self.assertEqual(result["number"], "125,000,000원")
        self.assertEqual(result["korean"], "일억 이천오백만 원")
        self.assertEqual(result["formal"], "금 일억 이천오백만 원정")
        self.assertEqual(number_to_korean_amount("일억 오천만원")["number"], "150,000,000원")

    def test_margin_calculation(self):
        result = calculate_margin({"price": "100000", "cost": "45000", "discount": "10000", "fee_rate": "6", "shipping": "3000"})
        self.assertEqual(result["fee"], "5,400원")
        self.assertEqual(result["profit"], "36,600원")
        self.assertEqual(result["margin_rate"], "40.67%")

    def test_margin_rejects_invalid_discount(self):
        with self.assertRaises(InputError):
            calculate_margin({"price": 1000, "cost": 0, "discount": 1200})

    def test_unit_conversions(self):
        self.assertEqual(convert_unit("34", "pyeong_to_sqm")["result"], "112.3967 ㎡")
        self.assertEqual(convert_unit("86", "f_to_c")["result"], "30 °C")
        self.assertEqual(convert_unit("1센치")["result"], "0.3937 inch")
        self.assertEqual(convert_unit("일 인치")["result"], "2.54 cm")
        self.assertEqual(convert_unit("1센치를 미터로")["result"], "0.01 m")
        self.assertEqual(convert_unit("1미터를 인치로")["result"], "39.3701 inch")

    @patch("app.tools._latest_rate", return_value=(Decimal("1400"), "2026-07-19"))
    def test_currency_conversion_and_default_target(self, _rate):
        result = convert_currency("100달러")
        self.assertEqual(result["result"], "140,000 KRW")
        self.assertEqual(result["source"], "USD")
        self.assertEqual(result["target"], "KRW")
        self.assertEqual(automatic_conversion("100달러", "currency")["primary"], "140,000 KRW")

    @patch("app.tools._latest_rate", return_value=(Decimal("0.0007142857"), "2026-07-19"))
    def test_currency_reverse_conversion(self, _rate):
        reverse = calculate_currency({"direction": "KRW_USD", "amount": "140000"})
        self.assertEqual(reverse["display"], "$100")

    @patch("app.tools._latest_rate", return_value=(Decimal("1400"), "2026-07-19"))
    def test_currency_accepts_korean_spoken_english_scale(self, _rate):
        for amount in ("원빌리언 달러", "1빌리언 달러"):
            with self.subTest(amount=amount):
                result = calculate_currency({"direction": "KRW_USD", "amount": amount})
                self.assertEqual(result["source"], "USD")
                self.assertEqual(result["target"], "KRW")
                self.assertEqual(result["display"], "1,400,000,000,000원")

    @patch("app.tools._latest_rate", return_value=(Decimal("0.001"), "2026-07-19"))
    def test_currency_infers_won_and_accepts_korean_number(self, _rate):
        result = calculate_currency({"direction": "USD_KRW", "amount": "백만원"})
        self.assertEqual(result["source"], "KRW")
        self.assertEqual(result["display"], "$1,000")

    @patch("app.tools._latest_rate", side_effect=[
        (Decimal("1400"), "2026-07-19"),
        (Decimal("0.0007142857"), "2026-07-19"),
    ])
    def test_currency_without_unit_returns_both_directions(self, _rate):
        result = calculate_currency({"amount": "100"})
        self.assertEqual(result["mode"], "both")
        self.assertEqual(result["usd_to_krw"]["display"], "140,000원")
        self.assertEqual(result["krw_to_usd"]["display"], "$0.07")

    def test_margin_accepts_korean_numbers(self):
        result = calculate_margin({"price": "십만원", "cost": "사만오천원", "discount": 0})
        self.assertEqual(result["profit"], "55,000원")

    def test_automatic_conversion_routes_intent(self):
        self.assertEqual(automatic_conversion("원빌리언")["primary"], "10억")
        self.assertEqual(automatic_conversion("1센치")["primary"], "0.3937 inch")
        self.assertEqual(automatic_conversion("삼십사평")["primary"], "112.3967 ㎡")

    def test_automatic_conversion_rejects_30_or_more_characters(self):
        with self.assertRaisesRegex(InputError, "30자 미만"):
            automatic_conversion("가" * 30)

    def test_automatic_conversion_asks_for_missing_unit(self):
        result = automatic_conversion("100", "currency")
        self.assertTrue(result["clarification"])
        self.assertEqual(result["primary"], "어떤 단위로 변환할까요?")

    def test_clean_list_preserves_first_seen_order(self):
        result = clean_list("김하나\n이둘\n김 하나\nTEST@example.com\ntest@example.com")
        self.assertEqual(result, {"cleaned": "김하나\n이둘\nTEST@example.com", "before": 5, "after": 3, "removed": 2})

    def test_count_text(self):
        self.assertEqual(count_text("한글 test\n둘"), {
            "with_spaces": 9,
            "without_spaces": 7,
            "words": 3,
            "lines": 2,
            "bytes": 15,
        })


if __name__ == "__main__":
    unittest.main()
