'''
things we have for each run
distance
time
pace
heartrate
day

convert this data to csv
week #, week distance, week time, week_heartrate, week_pace


add new col z_pace stata function std(week_pace)
add new col z_hr stata function std(week_heartrate)
add new col S_FF -(z_pace + z _heartrate)/2
add new col z_TMM = stata function std(week_distance)
add new col trainingload = z_TMM*(1-S_FF)

decay_fit = .78
decay_fat = .37

fit = trainlingload(week1)
fat = trainingload(week1)

N = num_weeks
for all weeks
    fit[i] = trainingload[i] + decay_fit * fit[i-1]
    fat[i] = trainingload[i] + decay_fat * fat[i-1]

coeffs = linear_regression(S_FF, [fit, fat])

modeledfitness = 
'''