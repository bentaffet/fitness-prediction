// /api/calc-weekly.js
export default async function handler(req, res) {
  try {
    const weeklyData = req.body;

    if (!weeklyData || !Array.isArray(weeklyData)) {
      return res.status(400).json({ error: "Invalid weekly summary data" });
    }

    const N = weeklyData.length;

    // Helper functions
    const mean = arr => arr.reduce((a,b) => a+b,0)/arr.length;
    const std = arr => {
      const m = mean(arr);
      return Math.sqrt(arr.reduce((sum,x) => sum + (x-m)*(x-m), 0)/arr.length);
    };

    // 1. Standardize pace and heartrate
    const paceArr = weeklyData.map(w => w.pace);
    const hrArr = weeklyData.map(w => w.heartrate !== null ? w.heartrate : 0);

    const paceStd = std(paceArr);
    const hrStd = std(hrArr);

    weeklyData.forEach(w => {
      w.z_pace = paceStd !== 0 ? (w.pace - mean(paceArr)) / paceStd : 0;
      w.z_hr = hrStd !== 0 ? (w.heartrate - mean(hrArr)) / hrStd : 0;
    });

    // 2. Performance metric S_FF
    weeklyData.forEach(w => {
      w.S_FF = -(w.z_pace + w.z_hr)/2;
    });

    // 3. Standardize distance and compute trainingload
    const distArr = weeklyData.map(w => w.distance);
    const distStd = std(distArr);

    weeklyData.forEach(w => {
      w.z_TMM = distStd !== 0 ? (w.distance - mean(distArr)) / distStd : 0;
      w.trainingload = w.z_TMM * (1 - w.S_FF);
    });

    // 4. Decay constants
    const decay_fit = 0.78;
    const decay_fat = 0.37;

    // 5. Initialize fit and fat
    weeklyData[0].fit = weeklyData[0].trainingload;
    weeklyData[0].fat = weeklyData[0].trainingload;

    // 6. Recursive fit and fat
    for (let i = 1; i < N; i++) {
      weeklyData[i].fit = weeklyData[i].trainingload + decay_fit * weeklyData[i-1].fit;
      weeklyData[i].fat = weeklyData[i].trainingload + decay_fat * weeklyData[i-1].fat;
    }

    // 7. Linear regression S_FF ~ fit + fat
    // Ordinary Least Squares: y = Xb, b = (X'X)^(-1) X'y
    // X = [ [1, fit, fat], ... ]
    const X = weeklyData.map(w => [1, w.fit, w.fat]);
    const y = weeklyData.map(w => w.S_FF);

    // Compute coefficients manually
    function linearRegression(X, y) {
      // Compute X'X
      const XtX = [
        [0,0,0],
        [0,0,0],
        [0,0,0]
      ];
      for (let i=0;i<X.length;i++){
        for (let j=0;j<3;j++){
          for (let k=0;k<3;k++){
            XtX[j][k] += X[i][j]*X[i][k];
          }
        }
      }
      // Compute X'y
      const Xty = [0,0,0];
      for (let i=0;i<X.length;i++){
        for (let j=0;j<3;j++){
          Xty[j] += X[i][j]*y[i];
        }
      }
      // Solve linear system XtX * b = Xty
      // Using Cramer's Rule for 3x3
      function det3(m){
        return m[0][0]*m[1][1]*m[2][2] + m[0][1]*m[1][2]*m[2][0] + m[0][2]*m[1][0]*m[2][1]
             - m[0][2]*m[1][1]*m[2][0] - m[0][1]*m[1][0]*m[2][2] - m[0][0]*m[1][2]*m[2][1];
      }
      function replaceCol(m,col,vec){
        return m.map((row,i) => row.map((val,j)=> j===col?vec[i]:val));
      }
      const detXtX = det3(XtX);
      if(detXtX===0) return [0,0,0];
      const b = [];
      for(let c=0;c<3;c++){
        b.push(det3(replaceCol(XtX,c,Xty))/detXtX);
      }
      return b;
    }

    const coeffs = linearRegression(X,y); // [intercept, b_fit, b_fat]

    // 8. Compute modeledfitness
    weeklyData.forEach(w=>{
      w.modeledfitness = coeffs[0] + coeffs[1]*w.fit + coeffs[2]*w.fat;
    });

    res.status(200).json(weeklyData);

  } catch(err) {
    res.status(500).json({error:"Server error", details:err.toString()});
  }
}
