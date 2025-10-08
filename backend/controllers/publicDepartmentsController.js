const { getDepartmentConfig } = require('../util/departmentsCache');

exports.list = async (req,res) => {
  try {
    const { departments, subDepartmentMap } = await getDepartmentConfig();
    res.json({ success:true, departments, subDepartmentMap });
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to load departments', error:e.message });
  }
};