"""
Unit tests for the Midjourney Parameter System
"""

import unittest
from .mj_parameters import MJParameterSystem, ParameterCategory, ValueType


class TestMJParameterSystem(unittest.TestCase):
    def setUp(self):
        self.mj = MJParameterSystem()

    def test_get_parameter_by_name(self):
        """Test getting parameter by name"""
        param = self.mj.get_parameter("quality")
        self.assertIsNotNone(param)
        self.assertEqual(param.name, "quality")

    def test_get_parameter_by_alias(self):
        """Test getting parameter by alias"""
        param = self.mj.get_parameter("--q")
        self.assertIsNotNone(param)
        self.assertEqual(param.name, "quality")

    def test_get_nonexistent_parameter(self):
        """Test getting a parameter that doesn't exist"""
        param = self.mj.get_parameter("nonexistent")
        self.assertIsNone(param)

    def test_get_parameters_by_category(self):
        """Test getting parameters by category"""
        style_params = self.mj.get_parameters_by_category(ParameterCategory.STYLE)
        self.assertGreater(len(style_params), 0)
        for param in style_params:
            self.assertEqual(param.category, ParameterCategory.STYLE)

    def test_validate_quality_values(self):
        """Test quality parameter validation"""
        self.assertTrue(self.mj.validate_parameter_value("quality", 0.25))
        self.assertTrue(self.mj.validate_parameter_value("quality", 0.5))
        self.assertTrue(self.mj.validate_parameter_value("quality", 1))
        self.assertTrue(self.mj.validate_parameter_value("quality", 2))
        self.assertFalse(self.mj.validate_parameter_value("quality", 5))

    def test_validate_chaos_range(self):
        """Test chaos parameter range validation"""
        self.assertTrue(self.mj.validate_parameter_value("chaos", 0))
        self.assertTrue(self.mj.validate_parameter_value("chaos", 50))
        self.assertTrue(self.mj.validate_parameter_value("chaos", 100))
        self.assertFalse(self.mj.validate_parameter_value("chaos", 150))
        self.assertFalse(self.mj.validate_parameter_value("chaos", -10))

    def test_validate_stylize_range(self):
        """Test stylize parameter range validation"""
        self.assertTrue(self.mj.validate_parameter_value("stylize", 0))
        self.assertTrue(self.mj.validate_parameter_value("stylize", 500))
        self.assertTrue(self.mj.validate_parameter_value("stylize", 1000))
        self.assertFalse(self.mj.validate_parameter_value("stylize", 1500))

    def test_build_parameter_string_basic(self):
        """Test building basic parameter string"""
        params = self.mj.build_parameter_string(
            aspect="16:9",
            quality=2
        )
        self.assertIn("--ar 16:9", params)
        self.assertIn("--q 2", params)

    def test_build_parameter_string_complex(self):
        """Test building complex parameter string"""
        params = self.mj.build_parameter_string(
            aspect="16:9",
            quality=2,
            stylize=750,
            chaos=30,
            seed=123456
        )
        self.assertIn("--ar 16:9", params)
        self.assertIn("--q 2", params)
        self.assertIn("--s 750", params)
        self.assertIn("--c 30", params)
        self.assertIn("--seed 123456", params)

    def test_build_parameter_string_boolean(self):
        """Test building parameter string with boolean parameters"""
        params = self.mj.build_parameter_string(
            tile=True,
            turbo=True
        )
        self.assertIn("--tile", params)
        self.assertIn("--turbo", params)

    def test_build_parameter_string_false_boolean(self):
        """Test that false boolean parameters are not included"""
        params = self.mj.build_parameter_string(
            tile=False,
            turbo=False
        )
        self.assertNotIn("--tile", params)
        self.assertNotIn("--turbo", params)

    def test_search_parameters(self):
        """Test searching parameters by keyword"""
        results = self.mj.search_parameters("style")
        self.assertGreater(len(results), 0)
        # Should find stylize, style, style_reference, etc.
        param_names = [p.name for p in results]
        self.assertIn("stylize", param_names)

    def test_search_parameters_case_insensitive(self):
        """Test that search is case insensitive"""
        results_lower = self.mj.search_parameters("quality")
        results_upper = self.mj.search_parameters("QUALITY")
        self.assertEqual(len(results_lower), len(results_upper))

    def test_get_all_categories(self):
        """Test getting all categories"""
        categories = self.mj.get_all_categories()
        self.assertIn("core", categories)
        self.assertIn("style", categories)
        self.assertIn("reference", categories)

    def test_parameter_has_required_fields(self):
        """Test that all parameters have required fields"""
        for param in self.mj.parameters.values():
            self.assertIsNotNone(param.name)
            self.assertIsNotNone(param.aliases)
            self.assertIsNotNone(param.category)
            self.assertIsNotNone(param.value_type)
            self.assertIsNotNone(param.description)
            self.assertIsNotNone(param.examples)
            self.assertGreater(len(param.aliases), 0)
            self.assertGreater(len(param.examples), 0)

    def test_all_parameters_count(self):
        """Test that we have a comprehensive set of parameters"""
        # Should have at least 25 parameters
        self.assertGreaterEqual(len(self.mj.parameters), 25)

    def test_aspect_ratio_parameter(self):
        """Test aspect ratio parameter details"""
        param = self.mj.get_parameter("aspect")
        self.assertEqual(param.name, "aspect")
        self.assertIn("--ar", param.aliases)
        self.assertEqual(param.default_value, "1:1")
        self.assertEqual(param.value_type, ValueType.RATIO)

    def test_version_parameter(self):
        """Test version parameter details"""
        param = self.mj.get_parameter("version")
        self.assertEqual(param.name, "version")
        self.assertIn("--v", param.aliases)
        self.assertEqual(param.default_value, 7)
        self.assertIn(7, param.accepted_values)

    def test_niji_parameter(self):
        """Test niji parameter details"""
        param = self.mj.get_parameter("niji")
        self.assertEqual(param.name, "niji")
        self.assertIn("--niji", param.aliases)
        self.assertEqual(param.category, ParameterCategory.SPECIAL)
        self.assertIn(6, param.accepted_values)

    def test_character_reference_parameter(self):
        """Test character reference parameter"""
        param = self.mj.get_parameter("character_reference")
        self.assertEqual(param.name, "character_reference")
        self.assertIn("--cref", param.aliases)
        self.assertEqual(param.category, ParameterCategory.REFERENCE)

    def test_weird_parameter(self):
        """Test weird parameter range"""
        param = self.mj.get_parameter("weird")
        self.assertEqual(param.max_value, 3000)
        self.assertTrue(self.mj.validate_parameter_value("weird", 1000))
        self.assertFalse(self.mj.validate_parameter_value("weird", 5000))


if __name__ == "__main__":
    unittest.main()
